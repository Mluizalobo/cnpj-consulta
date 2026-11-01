-- Endurecimento recomendado pelo Security Advisor do Supabase:
-- funções de gatilho não podem ser chamadas diretamente pela API (os gatilhos continuam funcionando).
alter function public.set_updated_at() set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_deletion() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
