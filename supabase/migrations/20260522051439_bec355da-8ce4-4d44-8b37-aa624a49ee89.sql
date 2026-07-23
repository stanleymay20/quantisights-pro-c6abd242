CREATE UNIQUE INDEX IF NOT EXISTS intelligence_memory_route_item_uniq
  ON public.intelligence_memory(route_id, intelligence_item_id);