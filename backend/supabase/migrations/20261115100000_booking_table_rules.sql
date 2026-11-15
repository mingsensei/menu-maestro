-- Guests and staff follow different table rules:
--   'day'     – online guests: any pending/approved booking blocks the table for the whole day.
--   'overlap' – admins: a table is blocked only when the time ranges overlap.
--   'none'    – no table check.
DROP FUNCTION IF EXISTS public.booking_save(bigint, jsonb, bigint[], boolean, boolean);
DROP FUNCTION IF EXISTS public.booking_transition(bigint, jsonb, boolean, boolean);
DROP FUNCTION IF EXISTS public.booking_assert_available(bigint, date, bigint[], text, boolean, boolean);

CREATE OR REPLACE FUNCTION public.booking_assert_available(
  p_booking_id bigint, p_date date, p_start time, p_end time, p_table_ids bigint[], p_email text,
  p_table_rule text, p_check_email boolean)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_table_rule NOT IN ('none', 'day', 'overlap') THEN RAISE EXCEPTION 'Unknown table rule %', p_table_rule; END IF;
  -- Serialise all writes for one date so two requests cannot claim the same table.
  PERFORM pg_advisory_xact_lock(hashtext('rtr-booking:' || p_date::text));
  IF p_table_rule <> 'none' AND EXISTS (
    SELECT 1 FROM public.bookings b JOIN public.booking_tables bt ON bt.booking_id = b.id
    WHERE bt.table_id = ANY (p_table_ids)
      AND b.booking_date = p_date
      AND b.status IN ('PENDING', 'APPROVED')
      AND b.id IS DISTINCT FROM p_booking_id
      AND (b.email_verified OR b.otp_expires_at > now())
      AND (p_table_rule = 'day' OR (b.start_time < p_end AND b.end_time > p_start))
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_AVAILABLE: The selected table is no longer available.';
  END IF;
  IF p_check_email AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE lower(b.customer_email) = lower(trim(p_email))
      AND b.booking_date = p_date
      AND b.email_verified
      AND b.id IS DISTINCT FROM p_booking_id
  ) THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_BOOKED_TODAY: This email already has a booking on the selected date.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_save(
  p_id bigint, p_data jsonb, p_table_ids bigint[], p_table_rule text, p_check_email boolean)
RETURNS bigint LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_id bigint := p_id;
BEGIN
  PERFORM public.booking_assert_available(p_id, (p_data->>'booking_date')::date, (p_data->>'start_time')::time,
    (p_data->>'end_time')::time, p_table_ids, p_data->>'customer_email', p_table_rule, p_check_email);
  IF v_id IS NULL THEN
    INSERT INTO public.bookings (booking_code, customer_name, customer_phone, customer_email, booking_date,
      start_time, end_time, number_of_guests, area, note, status, email_verified, verification_id, otp_hash, otp_expires_at)
    VALUES (p_data->>'booking_code', p_data->>'customer_name', p_data->>'customer_phone', p_data->>'customer_email',
      (p_data->>'booking_date')::date, (p_data->>'start_time')::time, (p_data->>'end_time')::time,
      (p_data->>'number_of_guests')::int, p_data->>'area', p_data->>'note', p_data->>'status',
      COALESCE((p_data->>'email_verified')::boolean, false), (p_data->>'verification_id')::uuid,
      p_data->>'otp_hash', (p_data->>'otp_expires_at')::timestamptz)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.bookings SET
      customer_name = p_data->>'customer_name', customer_phone = p_data->>'customer_phone',
      customer_email = p_data->>'customer_email', booking_date = (p_data->>'booking_date')::date,
      start_time = (p_data->>'start_time')::time, end_time = (p_data->>'end_time')::time,
      number_of_guests = (p_data->>'number_of_guests')::int, area = p_data->>'area', note = p_data->>'note',
      status = COALESCE(p_data->>'status', status)
    WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking not found.'; END IF;
    DELETE FROM public.booking_tables WHERE booking_id = v_id;
  END IF;
  INSERT INTO public.booking_tables (booking_id, table_id) SELECT v_id, unnest(p_table_ids);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_transition(
  p_id bigint, p_data jsonb, p_table_rule text, p_check_email boolean)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v public.bookings;
BEGIN
  SELECT * INTO v FROM public.bookings WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking not found.'; END IF;
  PERFORM public.booking_assert_available(p_id, v.booking_date, v.start_time, v.end_time,
    ARRAY(SELECT table_id FROM public.booking_tables WHERE booking_id = p_id),
    v.customer_email, p_table_rule, p_check_email);
  UPDATE public.bookings SET
    status = COALESCE(p_data->>'status', status),
    email_verified = COALESCE((p_data->>'email_verified')::boolean, email_verified),
    otp_hash = CASE WHEN p_data ? 'otp_hash' THEN p_data->>'otp_hash' ELSE otp_hash END,
    approved_at = CASE WHEN p_data ? 'approved_at' THEN (p_data->>'approved_at')::timestamptz ELSE approved_at END
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_assert_available(bigint, date, time, time, bigint[], text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_save(bigint, jsonb, bigint[], text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_transition(bigint, jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_assert_available(bigint, date, time, time, bigint[], text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_save(bigint, jsonb, bigint[], text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_transition(bigint, jsonb, text, boolean) TO service_role;
