import { SmileChatGeneral } from "@/components/smile-chat-general";

export default function HomePage() {
  const year = new Date().getFullYear();
  return (
    <>
      <SmileChatGeneral />
      <p className="shrink-0 border-t border-white/[0.04] py-2 text-center text-[0.65rem] text-[var(--text-faint)]">
        © {year} FIGHURAI
      </p>
    </>
  );
}
