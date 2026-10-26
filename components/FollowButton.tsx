"use client";
import { useAuth } from "./Auth";
import { useSocial } from "./Social";
export default function FollowButton({ profileId, small = false }: { profileId: string; small?: boolean }) {
  const { me } = useAuth();
  const { following, toggleFollow } = useSocial();
  if (me.profile?.id === profileId) return null;
  const on = following.has(profileId);
  return (
    <button onClick={(e) => { e.preventDefault(); toggleFollow(profileId); }} aria-pressed={on}
      className={(on ? "btn-ghost" : "btn-pop") + (small ? " px-2.5 py-1 text-xs" : "")}>
      {on ? "Following" : "Follow"}
    </button>
  );
}
