CREATE OR REPLACE FUNCTION public.search_knowledge(p_query text,p_source_key text DEFAULT null,p_limit int DEFAULT 8) RETURNS TABLE(chunk_id uuid,source_key text,source_title text,section text,page int,content text,rank real) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE q_and tsquery; q_or tsquery; n int; total numeric;
BEGIN
  IF p_query IS NULL OR length(trim(p_query))=0 THEN RETURN; END IF;
  IF length(p_query)>500 THEN RAISE EXCEPTION 'Söktexten är för lång.'; END IF;
  n:=greatest(1,least(coalesce(p_limit,8),8));
  q_and:=websearch_to_tsquery('swedish',p_query);
  q_or:=replace(plainto_tsquery('swedish',p_query)::text,' & ',' | ')::tsquery;
  SELECT count(*) INTO total FROM public.knowledge_chunks c JOIN public.knowledge_sources s ON s.id=c.source_id WHERE s.enabled AND (p_source_key IS NULL OR s.key=p_source_key);
  RETURN QUERY
  WITH base AS (
    SELECT c.id,c.source_id,c.section,c.page,c.position,c.content,c.tsv
    FROM public.knowledge_chunks c JOIN public.knowledge_sources s ON s.id=c.source_id
    WHERE s.enabled AND (p_source_key IS NULL OR s.key=p_source_key)
  ),
  terms AS (SELECT t.term FROM unnest(string_to_array(q_or::text,' | ')) AS t(term) WHERE t.term<>''),
  df AS (SELECT t.term,count(*) AS docs FROM base b JOIN terms t ON b.tsv@@t.term::tsquery GROUP BY t.term),
  fts AS (
    SELECT b.id,b.source_id,b.section,b.page,b.position,b.content,
      greatest(
        CASE WHEN q_and<>''::tsquery AND b.tsv@@q_and THEN 3*ts_rank_cd(b.tsv,q_and) ELSE 0 END,
        coalesce((SELECT sum(ts_rank_cd(b.tsv,t.term::tsquery)) FROM terms t WHERE b.tsv@@t.term::tsquery),0)
        +coalesce((SELECT max(ln(total/df.docs)) FROM terms t JOIN df ON df.term=t.term WHERE b.tsv@@t.term::tsquery),0)
      )::real AS r
    FROM base b
    WHERE (q_and<>''::tsquery AND b.tsv@@q_and) OR (q_or<>''::tsquery AND b.tsv@@q_or)
  ),
  tri AS (
    SELECT b.id,b.source_id,b.section,b.page,b.position,b.content,(word_similarity(p_query,b.content)*0.5)::real AS r
    FROM base b
    WHERE (SELECT count(*) FROM fts)<n
      AND NOT EXISTS(SELECT 1 FROM fts f WHERE f.id=b.id)
      AND (b.content % p_query OR word_similarity(p_query,b.content)>0.3)
  ),
  combined AS (SELECT * FROM fts UNION ALL SELECT * FROM tri)
  SELECT cb.id,s.key,s.title,cb.section,cb.page,cb.content,cb.r
  FROM combined cb JOIN public.knowledge_sources s ON s.id=cb.source_id
  ORDER BY cb.r DESC,cb.position,cb.id LIMIT n;
END $$;
REVOKE ALL ON FUNCTION public.search_knowledge(text,text,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_knowledge(text,text,int) TO authenticated,service_role;
