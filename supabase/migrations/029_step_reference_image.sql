-- ============================================================================
-- Migration: 029_step_reference_image
-- Adds an optional reference/target image to a step -- the thing participants
-- are asked to replicate or recreate in a "prompt guessing" activity. Most
-- useful on a gallery step, whose own instructions are deliberately hidden
-- from the participant's device (see step-instructions.ts getStepLayout):
-- the target image is what the facilitator projects instead.
--
-- Follows the column-threading pattern of 028_gallery_steps.sql: the same
-- three tables (module_steps, session_snapshot_steps, activity_library_steps)
-- need the column, or the template -> library -> template and
-- template -> session round trips silently drop it.
-- ============================================================================

ALTER TABLE module_steps
  ADD COLUMN reference_image_url TEXT;

ALTER TABLE session_snapshot_steps
  ADD COLUMN reference_image_url TEXT;

ALTER TABLE activity_library_steps
  ADD COLUMN reference_image_url TEXT;

-- Bucket for facilitator-uploaded reference images. Separate from
-- submission-images (012_submission_images.sql): that bucket's RLS and path
-- convention are keyed to a participant session, and this upload happens from
-- the admin template editor with no participant in scope.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'step-reference-images',
  'step-reference-images',
  TRUE, -- Public so the projection wall and presenter console load it without signed URLs
  5242880, -- 5MB limit, matching submission-images
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service upload step reference images"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'step-reference-images');

CREATE POLICY "Service update step reference images"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'step-reference-images');

CREATE POLICY "Service delete step reference images"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'step-reference-images');

CREATE POLICY "Public view step reference images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'step-reference-images');

COMMENT ON COLUMN module_steps.reference_image_url IS
  'Optional target/reference image for the step (e.g. "replicate this image" prompt-guessing activities). Shown to the facilitator on the presenter console and projection wall, not on the participant''s own device.';
