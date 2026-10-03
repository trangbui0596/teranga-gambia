UPDATE public.answers SET
  transcript_src = replace(transcript_src, 'Noor', 'Noor'),
  english = replace(english, 'Noor', 'Noor'),
  german = replace(german, 'Noor', 'Noor'),
  dutch = replace(dutch, 'Noor', 'Noor')
WHERE transcript_src LIKE '%Noor%' OR english LIKE '%Noor%' OR german LIKE '%Noor%' OR dutch LIKE '%Noor%';
UPDATE public.questions SET text_en = replace(text_en, 'Noor', 'Noor') WHERE text_en LIKE '%Noor%';
UPDATE public.visitor_questions SET text = replace(text, 'Noor', 'Noor') WHERE text LIKE '%Noor%';