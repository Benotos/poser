import { avatarUri } from "@/lib/avatar";
export default function Avatar({ seed, bot = false, size = 28 }: { seed: string; bot?: boolean; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUri(seed, bot)} width={size} height={size} alt="" className="px shrink-0 rounded-sm bg-ink" />
  );
}
