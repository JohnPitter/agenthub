interface TerminalStatusBarProps {
  cliVersion: string | null;
}

export function TerminalStatusBar({ cliVersion }: TerminalStatusBarProps) {
  return (
    <div className="flex h-8 items-center justify-between border-t border-white/5 bg-[#0d0d14] px-4">
      {/* Left: CLI version */}
      <span className="text-[11px] font-mono text-white/30">
        {cliVersion ? `Claude CLI ${cliVersion}` : ""}
      </span>

      {/* Right: branding */}
      <span className="text-[11px] font-semibold tracking-wider text-white/15 uppercase">
        pulse
      </span>
    </div>
  );
}
