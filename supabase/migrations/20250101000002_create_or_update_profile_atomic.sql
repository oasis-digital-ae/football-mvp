CREATE OR REPLACE FUNCTION "public"."create_or_update_profile_atomic"("p_user_id" "uuid", "p_username" "text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text", "p_birthday" "date" DEFAULT NULL::"date", "p_country" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_reffered_by" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_full_name text;
BEGIN
  -- Build full_name from first_name and last_name if provided
  IF p_first_name IS NOT NULL AND p_last_name IS NOT NULL THEN
    v_full_name := p_first_name || ' ' || p_last_name;
  ELSIF p_first_name IS NOT NULL THEN
    v_full_name := p_first_name;
  ELSIF p_last_name IS NOT NULL THEN
    v_full_name := p_last_name;
  ELSE
    v_full_name := NULL;
  END IF;

  -- Use INSERT ... ON CONFLICT to ensure atomicity
  INSERT INTO public.profiles (
    id,
    username,
    first_name,
    last_name,
    full_name,
    email,
    birthday,
    country,
    phone,
    reffered_by
  ) VALUES (
    p_user_id,
    p_username,
    p_first_name,
    p_last_name,
    v_full_name,
    p_email,
    p_birthday,
    p_country,
    p_phone,
    p_reffered_by
  )
  ON CONFLICT (id) DO UPDATE SET
    username = COALESCE(EXCLUDED.username, profiles.username),
    first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    email = COALESCE(EXCLUDED.email, profiles.email),
    birthday = COALESCE(EXCLUDED.birthday, profiles.birthday),
    country = COALESCE(EXCLUDED.country, profiles.country),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    reffered_by = COALESCE(EXCLUDED.reffered_by, profiles.reffered_by),
    updated_at = NOW();
END;
$$;


GRANT ALL ON FUNCTION "public"."create_or_update_profile_atomic"("p_user_id" "uuid", "p_username" "text", "p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_birthday" "date", "p_country" "text", "p_phone" "text", "p_reffered_by" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."create_or_update_profile_atomic"("p_user_id" "uuid", "p_username" "text", "p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_birthday" "date", "p_country" "text", "p_phone" "text", "p_reffered_by" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."create_or_update_profile_atomic"("p_user_id" "uuid", "p_username" "text", "p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_birthday" "date", "p_country" "text", "p_phone" "text", "p_reffered_by" "text") TO "service_role";




