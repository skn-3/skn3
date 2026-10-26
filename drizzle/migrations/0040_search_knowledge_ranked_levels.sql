CREATE OR REPLACE FUNCTION public.search_knowledge(p_query text,p_source_key text DEFAULT null,p_limit int DEFAULT 8) RETURNS TABLE(chunk_id uuid,source_key text,source_title text,section text,page int,content text,rank real) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE q_and tsquery; q_or tsquery; n int;
BEGIN
  IF p_query IS NULL OR length(trim(p_query))=0 THEN RETURN; END IF;
  IF length(p_query)>500 THEN RAISE EXCEPTION 'Söktexten är för lång.'; END IF;
  n:=greatest(1,least(coalesce(p_limit,8),8));
  q_and:=websearch_to_tsquery('swedish',p_query);
  q_or:=replace(plainto_tsquery('swedish',p_query)::text,' & ',' | ')::tsquery;
  RETURN QUERY
  WITH fts AS (
    SELECT c.id,c.source_id,c.section,c.page,c.position,c.content,
      (CASE WHEN q_and<>''::tsquery AND c.tsv@@q_and THEN ts_rank_cd(c.tsv,q_and)*3 ELSE 0 END
      +CASE WHEN q_or<>''::tsquery AND c.tsv@@q_or THEN ts_rank_cd(c.tsv,q_or) ELSE 0 END)::real AS r
    FROM public.knowledge_chunks c JOIN public.knowledge_sources s ON s.id=c.source_id
    WHERE s.enabled AND (p_source_key IS NULL OR s.key=p_source_key)
      AND ((q_and<>''::tsquery AND c.tsv@@q_and) OR (q_or<>''::tsquery AND c.tsv@@q_or))
  ),
  tri AS (
    SELECT c.id,c.source_id,c.section,c.page,c.position,c.content,(word_similarity(p_query,c.content)*0.5)::real AS r
    FROM public.knowledge_chunks c JOIN public.knowledge_sources s ON s.id=c.source_id
    WHERE s.enabled AND (p_source_key IS NULL OR s.key=p_source_key)
      AND (SELECT count(*) FROM fts)<n
      AND NOT EXISTS(SELECT 1 FROM fts f WHERE f.id=c.id)
      AND (c.content % p_query OR word_similarity(p_query,c.content)>0.3)
  ),
  combined AS (SELECT * FROM fts UNION ALL SELECT * FROM tri)
  SELECT cb.id,s.key,s.title,cb.section,cb.page,cb.content,cb.r
  FROM combined cb JOIN public.knowledge_sources s ON s.id=cb.source_id
  ORDER BY cb.r DESC,cb.position,cb.id LIMIT n;
END $$;
REVOKE ALL ON FUNCTION public.search_knowledge(text,text,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_knowledge(text,text,int) TO authenticated,service_role;
