import { CommandDetailPage } from "@/features/executions";

export default async function CommandDetailRoute({
  params,
}: {
  params: Promise<{ commandId: string }>;
}) {
  const { commandId } = await params;

  return <CommandDetailPage commandId={commandId} />;
}
