
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Meeting',
  duration_seconds INTEGER DEFAULT 0,
  transcript JSONB DEFAULT '[]'::jsonb,
  tldr TEXT,
  summary TEXT,
  key_decisions JSONB DEFAULT '[]'::jsonb,
  action_items JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'processing',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view meetings" ON public.meetings FOR SELECT USING (true);
CREATE POLICY "Public can insert meetings" ON public.meetings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update meetings" ON public.meetings FOR UPDATE USING (true);
CREATE POLICY "Public can delete meetings" ON public.meetings FOR DELETE USING (true);

CREATE INDEX idx_meetings_created_at ON public.meetings(created_at DESC);
