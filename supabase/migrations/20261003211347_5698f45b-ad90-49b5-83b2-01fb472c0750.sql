-- Lock everything down: only server code (service role) touches tables.
DROP POLICY IF EXISTS "questions public read" ON public.questions;
DROP POLICY IF EXISTS "questions champion write" ON public.questions;
DROP POLICY IF EXISTS "recordings champion all" ON public.recordings;
DROP POLICY IF EXISTS "recordings of approved answers public" ON public.recordings;
DROP POLICY IF EXISTS "answers approved public read" ON public.answers;
DROP POLICY IF EXISTS "answers champion all" ON public.answers;
DROP POLICY IF EXISTS "answers approved read auth" ON public.answers;
DROP POLICY IF EXISTS "answer_audio champion all" ON public.answer_audio;
DROP POLICY IF EXISTS "visitors can log questions" ON public.visitor_questions;
DROP POLICY IF EXISTS "visitor_questions champion all" ON public.visitor_questions;
DROP POLICY IF EXISTS "visitors flag unanswered" ON public.unanswered;
DROP POLICY IF EXISTS "unanswered champion all" ON public.unanswered;
DROP POLICY IF EXISTS "champion reads recordings files" ON storage.objects;
DROP POLICY IF EXISTS "champion uploads recordings files" ON storage.objects;
DROP POLICY IF EXISTS "champion updates recordings files" ON storage.objects;
REVOKE ALL ON public.questions, public.recordings, public.answers, public.answer_audio, public.visitor_questions, public.unanswered FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_clarity(uuid, boolean) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.record_clarity(uuid, boolean);
DROP TRIGGER IF EXISTS on_auth_user_created_champion ON auth.users;
DROP FUNCTION IF EXISTS public.assign_first_champion();

CREATE TABLE public.conversations (
  phone_hash text PRIMARY KEY,
  role text NOT NULL DEFAULT 'visitor' CHECK (role IN ('visitor','champion')),
  state text NOT NULL DEFAULT 'idle',
  current_question_position int,
  lang text NOT NULL DEFAULT 'en' CHECK (lang IN ('en','de','nl')),
  last_visitor_question_id uuid REFERENCES public.visitor_questions(id) ON DELETE SET NULL,
  current_review_answer_id uuid REFERENCES public.answers(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER conversations_touch BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Remove the made-up phone number from the sample "how to book" answer.
UPDATE public.answers a SET
  english = 'Send Noor a WhatsApp message at least one day before the tour.',
  german = 'Schicken Sie Noor mindestens einen Tag vor der Tour eine WhatsApp-Nachricht.',
  dutch = 'Stuur Noor minstens een dag voor de tour een WhatsApp-bericht.'
FROM public.recordings r JOIN public.questions q ON q.id = r.question_id
WHERE a.recording_id = r.id AND q.topic = 'how to book' AND a.is_sample;