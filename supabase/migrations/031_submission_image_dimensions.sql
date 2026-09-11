-- ============================================================================
-- Migration: 031_submission_image_dimensions
-- The projection wall's masonry layout (ProjectionWall.tsx) needs each
-- image's aspect ratio to size its tile. Nothing stored that, so the wall
-- discovered it client-side by loading every image with `new Image()` after
-- reveal. With many images revealed in a burst (e.g. a room submitting near
-- a deadline), those probes queue behind the browser's per-host connection
-- limit and take seconds to resolve -- pagination is computed with a
-- fallback square ratio for anything not yet resolved, then reflows (shifting
-- which images land on which page) as each real ratio arrives. A facilitator
-- can land on a page that's transiently empty or sparse mid-resolution.
--
-- The participant's browser already has the image decoded before upload
-- (src/lib/utils/image-upload.ts), so capturing width/height there and
-- storing them removes the client-side probing (and its race) entirely for
-- every submission going forward.
-- ============================================================================

ALTER TABLE submissions
  ADD COLUMN image_width INTEGER,
  ADD COLUMN image_height INTEGER;

COMMENT ON COLUMN submissions.image_width IS
  'Natural pixel width of the uploaded image, captured client-side at upload time. Null for submissions made before this column existed -- the wall falls back to client-side probing for those.';
COMMENT ON COLUMN submissions.image_height IS
  'Natural pixel height of the uploaded image, captured client-side at upload time. Null for submissions made before this column existed.';
