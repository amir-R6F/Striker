import { SETTING_KEYS } from "../../lib/settings";
import { useAppStore } from "../../store/useAppStore";
import { Card, SectionTitle } from "../ui";

export function EncryptionSettings() {
  const settings = useAppStore((state) => state.settings);
  const deviceKeyReady = Boolean(settings[SETTING_KEYS.deviceKey]);

  return (
    <section>
      <SectionTitle>Encryption</SectionTitle>
      <Card className="space-y-2.5 text-[10.5px] leading-relaxed text-muted">
        <div>
          <p className="text-[12.5px] font-medium text-ink">Stored secrets</p>
          <p className="mt-0.5">
            The AI API key and WebDAV password are stored with AES-256-GCM. The
            key is generated per install and never leaves this device. Plain
            JSON exports omit secrets entirely.
          </p>
          <p className="mt-1 text-[9.5px]">
            {deviceKeyReady
              ? "Device key active."
              : "A device key is created the first time you save a secret."}
          </p>
        </div>

        <div className="border-t border-line pt-2.5">
          <p className="text-[12.5px] font-medium text-ink">Encrypted backups</p>
          <p className="mt-0.5">
            Sync backups use PBKDF2-SHA256 with 310,000 iterations and
            AES-256-GCM, keyed by the passphrase you enter. The passphrase is
            never stored.
          </p>
        </div>

        <div className="border-t border-line pt-2.5">
          <p className="text-[12.5px] font-medium text-ink">
            Database file (SQLCipher)
          </p>
          <p className="mt-0.5">
            Not enabled. The stock{" "}
            <code>tauri-plugin-sql</code> shipped with Tauri 2 opens SQLite
            without SQLCipher, so a passphrase cannot encrypt the live{" "}
            <code>striker.db</code> in this build. Enabling it requires swapping
            in a SQLCipher-enabled SQL plugin build; the encrypted backup above
            is the supported at-rest protection here.
          </p>
        </div>
      </Card>
    </section>
  );
}
