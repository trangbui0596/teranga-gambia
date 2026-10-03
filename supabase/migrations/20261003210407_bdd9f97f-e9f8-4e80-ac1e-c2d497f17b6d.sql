CREATE TYPE public.app_role AS ENUM ('champion');
CREATE TYPE public.review_status AS ENUM ('pending','approved','rerecord','needs_bilingual');

CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role app_role NOT NULL, UNIQUE(user_id, role));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

-- First signed-up user becomes the champion
CREATE OR REPLACE FUNCTION public.assign_first_champion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role='champion') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'champion');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_champion AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.assign_first_champion();

CREATE TABLE public.questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), position int NOT NULL UNIQUE, text_en text NOT NULL, topic text NOT NULL);
GRANT SELECT ON public.questions TO anon, authenticated; GRANT INSERT, UPDATE, DELETE ON public.questions TO authenticated; GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions public read" ON public.questions FOR SELECT USING (true);
CREATE POLICY "questions champion write" ON public.questions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'champion')) WITH CHECK (public.has_role(auth.uid(),'champion'));

CREATE TABLE public.recordings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE, audio_path text, week text NOT NULL, status text NOT NULL DEFAULT 'imported', is_sample boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recordings TO authenticated; GRANT ALL ON public.recordings TO service_role;
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recordings champion all" ON public.recordings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'champion')) WITH CHECK (public.has_role(auth.uid(),'champion'));

CREATE TABLE public.answers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recording_id uuid NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE, transcript_src text, english text, german text, dutch text, roundtrip_score numeric, flags text[] NOT NULL DEFAULT '{}', review_status review_status NOT NULL DEFAULT 'pending', approved_at timestamptz, is_sample boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.answers TO anon; GRANT SELECT, INSERT, UPDATE, DELETE ON public.answers TO authenticated; GRANT ALL ON public.answers TO service_role;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "answers approved public read" ON public.answers FOR SELECT TO anon USING (review_status='approved');
CREATE POLICY "answers champion all" ON public.answers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'champion')) WITH CHECK (public.has_role(auth.uid(),'champion'));
CREATE POLICY "answers approved read auth" ON public.answers FOR SELECT TO authenticated USING (review_status='approved');

CREATE TABLE public.answer_audio (answer_id uuid NOT NULL REFERENCES public.answers(id) ON DELETE CASCADE, lang text NOT NULL, audio_path text NOT NULL, PRIMARY KEY(answer_id, lang));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.answer_audio TO authenticated; GRANT ALL ON public.answer_audio TO service_role;
ALTER TABLE public.answer_audio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "answer_audio champion all" ON public.answer_audio FOR ALL TO authenticated USING (public.has_role(auth.uid(),'champion')) WITH CHECK (public.has_role(auth.uid(),'champion'));

CREATE TABLE public.visitor_questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500), lang text NOT NULL CHECK (lang IN ('en','de','nl')), matched_answer_id uuid REFERENCES public.answers(id) ON DELETE SET NULL, confidence numeric, was_clear boolean, is_sample boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT INSERT ON public.visitor_questions TO anon; GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_questions TO authenticated; GRANT ALL ON public.visitor_questions TO service_role;
ALTER TABLE public.visitor_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitors can log questions" ON public.visitor_questions FOR INSERT TO anon WITH CHECK (was_clear IS NULL AND is_sample = false);
CREATE POLICY "visitor_questions champion all" ON public.visitor_questions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'champion')) WITH CHECK (public.has_role(auth.uid(),'champion'));

CREATE TABLE public.unanswered (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), visitor_question_id uuid NOT NULL REFERENCES public.visitor_questions(id) ON DELETE CASCADE, added_to_round_week text, created_at timestamptz NOT NULL DEFAULT now());
GRANT INSERT ON public.unanswered TO anon; GRANT SELECT, INSERT, UPDATE, DELETE ON public.unanswered TO authenticated; GRANT ALL ON public.unanswered TO service_role;
ALTER TABLE public.unanswered ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitors flag unanswered" ON public.unanswered FOR INSERT TO anon WITH CHECK (added_to_round_week IS NULL);
CREATE POLICY "unanswered champion all" ON public.unanswered FOR ALL TO authenticated USING (public.has_role(auth.uid(),'champion')) WITH CHECK (public.has_role(auth.uid(),'champion'));

-- Visitor "was this clear?" feedback via safe function
CREATE OR REPLACE FUNCTION public.record_clarity(_id uuid, _clear boolean) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.visitor_questions SET was_clear=_clear WHERE id=_id AND was_clear IS NULL AND created_at > now() - interval '1 hour';
$$;
GRANT EXECUTE ON FUNCTION public.record_clarity(uuid, boolean) TO anon, authenticated;

-- Seed SAMPLE data
INSERT INTO public.questions(position, text_en, topic) VALUES
(1,'How much does the tour cost?','price'),
(2,'Where do we meet?','meeting point'),
(3,'How long is the tour?','duration'),
(4,'What should we bring?','what to bring'),
(5,'Can children come?','children'),
(6,'Is food included or available?','food'),
(7,'Is it safe?','safety'),
(8,'What is included?','whats included'),
(9,'How do I book?','how to book'),
(10,'What is the cancellation policy?','cancellation');

INSERT INTO public.recordings(question_id, audio_path, week, status, is_sample)
SELECT id, NULL, '2026-W40', 'sample', true FROM public.questions;

INSERT INTO public.answers(recording_id, transcript_src, english, german, dutch, roundtrip_score, flags, review_status, approved_at, is_sample)
SELECT r.id, v.src, v.en, v.de, v.nl, v.score, v.flags, v.status::review_status, CASE WHEN v.status='approved' THEN now() END, true
FROM public.recordings r JOIN public.questions q ON q.id=r.question_id
JOIN (VALUES
(1,'[Sample Wolof transcript] Tour bi 1500 dalasi la...','The tour costs 1,500 dalasi per adult, about 20 euros. Children under 12 pay 750 dalasi.','Die Tour kostet 1.500 Dalasi pro Erwachsenem, etwa 20 Euro. Kinder unter 12 zahlen 750 Dalasi.','De tour kost 1.500 dalasi per volwassene, ongeveer 20 euro. Kinderen onder 12 betalen 750 dalasi.',0.94,ARRAY['machine-translated'],'approved'),
(2,'[Sample Wolof transcript] Danu daje ci Senegambia...','We meet at the Senegambia Craft Market entrance in Kololi at 9:00 in the morning.','Wir treffen uns um 9:00 Uhr morgens am Eingang des Senegambia Craft Market in Kololi.','We ontmoeten elkaar om 9:00 uur bij de ingang van de Senegambia Craft Market in Kololi.',0.91,ARRAY['machine-translated'],'approved'),
(3,'[Sample Wolof transcript] Tour bi 4 waxtu la...','The tour lasts about 4 hours, including a stop at Lamin Lodge.','Die Tour dauert etwa 4 Stunden, mit einem Halt an der Lamin Lodge.','De tour duurt ongeveer 4 uur, met een stop bij Lamin Lodge.',0.88,ARRAY['machine-translated'],'approved'),
(4,'[Sample Wolof transcript] Indil ndox ak mbaxana...','Bring water, a hat, sun cream and comfortable shoes.','Bringen Sie Wasser, einen Hut, Sonnencreme und bequeme Schuhe mit.','Neem water, een hoed, zonnebrand en comfortabele schoenen mee.',0.93,ARRAY['machine-translated'],'approved'),
(5,'[Sample Wolof transcript] Xale yi man nanu ñëw...','Children are welcome from age 5. Babies are not recommended because of the boat.','Kinder sind ab 5 Jahren willkommen. Für Babys ist die Bootsfahrt nicht empfohlen.','Kinderen zijn welkom vanaf 5 jaar. Baby''s worden afgeraden vanwege de boot.',0.62,ARRAY['machine-translated','round-trip mismatch'],'pending'),
(6,'[Sample Wolof transcript] Benachin...','Lunch is benachin at a family compound in Brikama. Tell us about allergies.','Mittagessen ist Benachin in einem Familienhof in Brikama. Sagen Sie uns Bescheid bei Allergien.','De lunch is benachin bij een familie in Brikama. Meld allergieën vooraf.',0.71,ARRAY['machine-translated','low confidence'],'pending'),
(7,'[Sample Wolof transcript] Amul benn jafe-jafe...','Yes, it is safe. A licensed guide stays with you the whole time.','Ja, es ist sicher. Ein lizenzierter Guide bleibt die ganze Zeit bei Ihnen.','Ja, het is veilig. Een erkende gids blijft de hele tijd bij u.',0.9,ARRAY['machine-translated'],'pending'),
(8,'[Sample Wolof transcript] Bateau, lekk, guide...','Included: boat trip, lunch, guide and transport from Kololi.','Inklusive: Bootsfahrt, Mittagessen, Guide und Transport ab Kololi.','Inbegrepen: boottocht, lunch, gids en vervoer vanaf Kololi.',0.55,ARRAY['machine-translated','round-trip mismatch','low confidence'],'needs_bilingual'),
(9,'[Sample Wolof transcript] Woo Noor...','Call or message Noor on +220 700 0000 (sample number) one day before.','Rufen Sie Noor unter +220 700 0000 (Beispielnummer) einen Tag vorher an.','Bel Noor op +220 700 0000 (voorbeeldnummer) een dag van tevoren.',0.89,ARRAY['machine-translated'],'approved'),
(10,'[Sample Wolof transcript] ...','(unclear audio)','(unklar)','(onduidelijk)',0.3,ARRAY['machine-translated','low confidence'],'rerecord')
) AS v(pos,src,en,de,nl,score,flags,status) ON v.pos=q.position;

INSERT INTO public.visitor_questions(text, lang, confidence, is_sample) VALUES
('Do you pick up from Banjul airport?','en',0.1,true),
('Kann man Vögel beobachten?','de',0.05,true);
INSERT INTO public.unanswered(visitor_question_id, added_to_round_week)
SELECT id, '2026-W41' FROM public.visitor_questions WHERE is_sample;