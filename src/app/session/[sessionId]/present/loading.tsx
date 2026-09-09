/**
 * Overrides the shared session loading skeleton, which renders the presenter
 * *console* layout (sidebar + stat panels). On a projector that would flash a
 * fake dashboard in front of the room on every navigation to the wall.
 */
export default function ProjectionWallLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B1020] text-white">
      <p className="text-2xl font-semibold tracking-tight text-white/70">
        Preparing the gallery&hellip;
      </p>
    </div>
  );
}
