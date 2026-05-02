// Edge function: transcribe audio with Gemini and extract structured summary.
// Called from the client with { meetingId, audioBase64, mimeType }.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { meetingId, audioBase64, mimeType } = await req.json();
    if (!meetingId || !audioBase64) {
      return new Response(JSON.stringify({ error: "Missing meetingId or audio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Step 1: Transcription with diarization via Gemini multimodal
    const transcribePrompt = `You are an expert meeting transcriber. Transcribe this audio recording into a structured JSON transcript with speaker diarization.

Return ONLY valid JSON in this exact schema (no markdown, no prose):
{
  "segments": [
    { "speaker": "Speaker 1", "timestamp": "00:00", "text": "..." }
  ]
}

Rules:
- Identify distinct speakers as "Speaker 1", "Speaker 2", etc. (or use names if clearly stated).
- Use MM:SS timestamps (or HH:MM:SS for long recordings) at segment starts.
- Break into natural turn-by-turn segments.
- If audio is unclear or silent, return { "segments": [] }.`;

    const transcribeRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: transcribePrompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType || "audio/webm"};base64,${audioBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!transcribeRes.ok) {
      const errText = await transcribeRes.text();
      console.error("Transcribe error:", transcribeRes.status, errText);
      if (transcribeRes.status === 429) {
        await supabase.from("meetings").update({ status: "error" }).eq("id", meetingId);
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (transcribeRes.status === 402) {
        await supabase.from("meetings").update({ status: "error" }).eq("id", meetingId);
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in workspace settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Transcription failed: ${errText}`);
    }

    const transcribeData = await transcribeRes.json();
    const transcribeRaw = transcribeData.choices?.[0]?.message?.content || "";
    const cleaned = transcribeRaw.replace(/```json|```/g, "").trim();
    let parsedTranscript: { segments: Array<{ speaker: string; timestamp: string; text: string }> } = { segments: [] };
    try {
      parsedTranscript = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse transcript JSON:", cleaned.slice(0, 200));
      parsedTranscript = { segments: [{ speaker: "Speaker 1", timestamp: "00:00", text: cleaned }] };
    }

    const fullTranscriptText = parsedTranscript.segments
      .map((s) => `[${s.timestamp}] ${s.speaker}: ${s.text}`)
      .join("\n");

    // Step 2: Structured summary via tool calling
    const summarizeRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an expert meeting analyst. Extract a concise title, TLDR, full summary, key decisions, and assigned action items from the transcript.",
          },
          { role: "user", content: `Transcript:\n\n${fullTranscriptText || "(empty transcript)"}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_meeting_insights",
              description: "Extract structured insights from a meeting transcript.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Concise 3-7 word meeting title" },
                  tldr: { type: "string", description: "One sentence summary capturing the essence" },
                  summary: { type: "string", description: "2-4 sentence narrative summary" },
                  key_decisions: {
                    type: "array",
                    items: { type: "string" },
                    description: "Important decisions made",
                  },
                  action_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        task: { type: "string" },
                        assignee: { type: "string" },
                      },
                      required: ["task", "assignee"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "tldr", "summary", "key_decisions", "action_items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_meeting_insights" } },
      }),
    });

    if (!summarizeRes.ok) {
      const errText = await summarizeRes.text();
      console.error("Summarize error:", errText);
      throw new Error(`Summarization failed: ${errText}`);
    }

    const summarizeData = await summarizeRes.json();
    const toolCall = summarizeData.choices?.[0]?.message?.tool_calls?.[0];
    let insights = {
      title: "Untitled Meeting",
      tldr: "",
      summary: "",
      key_decisions: [] as string[],
      action_items: [] as Array<{ task: string; assignee: string }>,
    };
    if (toolCall?.function?.arguments) {
      try {
        insights = { ...insights, ...JSON.parse(toolCall.function.arguments) };
      } catch (e) {
        console.error("Failed to parse insights:", e);
      }
    }

    // Step 3: Persist
    const { error: updateError } = await supabase
      .from("meetings")
      .update({
        title: insights.title,
        transcript: parsedTranscript.segments,
        tldr: insights.tldr,
        summary: insights.summary,
        key_decisions: insights.key_decisions,
        action_items: insights.action_items,
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", meetingId);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, meetingId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-audio error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
