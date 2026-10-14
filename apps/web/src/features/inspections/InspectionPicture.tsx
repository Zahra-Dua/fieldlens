import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { fetchImageDataUrl } from "./api";
import type { InspectionImage } from "./types";

// A fixed 4:3 frame. The picture, the loading state and the error state all
// have the same size, so the page does not move when the picture arrives.
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      {children}
    </div>
  );
}

function LoadedPicture({ inspectionId, imageId }: { inspectionId: string; imageId: string }) {
  const query = useQuery({
    queryKey: ["inspections", "image", inspectionId, imageId],
    queryFn: ({ signal }) => fetchImageDataUrl(inspectionId, imageId, signal),
    // A stored picture never changes.
    staleTime: Infinity,
  });

  if (query.isPending) {
    return (
      <Frame>
        <div
          role="status"
          aria-label="Loading picture"
          className="h-full w-full animate-pulse bg-slate-200"
        />
      </Frame>
    );
  }

  if (query.isError) {
    return (
      <Frame>
        <div role="alert" className="space-y-2 px-4 text-center">
          <p className="text-sm text-slate-600">The picture could not be loaded.</p>
          <button
            type="button"
            onClick={() => {
              void query.refetch();
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Try again
          </button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <img src={query.data} alt="The inspected item" className="h-full w-full object-contain" />
    </Frame>
  );
}

export default function InspectionPicture({
  inspectionId,
  image,
}: {
  inspectionId: string;
  image: InspectionImage | undefined;
}) {
  if (image === undefined) {
    return (
      <Frame>
        <p className="text-sm text-slate-500">No picture was uploaded.</p>
      </Frame>
    );
  }

  return <LoadedPicture inspectionId={inspectionId} imageId={image.id} />;
}
