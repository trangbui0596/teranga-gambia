UPDATE public.answers SET
  transcript_src = replace(transcript_src, 'Fatou', 'Noor'),
  english = replace(english, 'Fatou', 'Noor'),
  german = replace(german, 'Fatou', 'Noor'),
  dutch = replace(dutch, 'Fatou', 'Noor')
WHERE transcript_src LIKE '%Fatou%' OR english LIKE '%Fatou%' OR german LIKE '%Fatou%' OR dutch LIKE '%Fatou%';
UPDATE public.questions SET text_en = replace(text_en, 'Fatou', 'Noor') WHERE text_en LIKE '%Fatou%';
UPDATE public.visitor_questions SET text = replace(text, 'Fatou', 'Noor') WHERE text LIKE '%Fatou%';