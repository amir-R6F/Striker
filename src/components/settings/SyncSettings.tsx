import { useEffect, useState } from "react";
import { restoreBundle } from "../../lib/db";
import { readSecret, saveSecret } from "../../lib/secrets";
import {
  SETTING_KEYS,
  syncFileName,
  syncKind,
  type SyncKind,
} from "../../lib/settings";
import {
  buildEncryptedBackup,
  downloadBackup,
  readEncryptedBackup,
  sanitizeSyncFileName,
  uploadBackup,
  validateSyncConfig,
  type SyncConfig,
} from "../../lib/sync";
import { useAppStore } from "../../store/useAppStore";
import {
  Button,
  Card,
  Field,
  SectionTitle,
  Segmented,
  TextInput,
} from "../ui";

export function SyncSettings() {
  const settings = useAppStore((state) => state.settings);
  const setSetting = useAppStore((state) => state.setSetting);
  const hydrate = useAppStore((state) => state.hydrate);
  const notify = useAppStore((state) => state.notify);

  const [kind, setKind] = useState<SyncKind>(syncKind(settings));
  const [folder, setFolder] = useState(
    settings[SETTING_KEYS.syncFolder] ?? "",
  );
  const [webdavUrl, setWebdavUrl] = useState(
    settings[SETTING_KEYS.syncWebdavUrl] ?? "",
  );
  const [username, setUsername] = useState(
    settings[SETTING_KEYS.syncWebdavUser] ?? "",
  );
  const [passwordDraft, setPasswordDraft] = useState("");
  const [fileName, setFileName] = useState(syncFileName(settings));
  const [passphrase, setPassphrase] = useState("");
  const [passphraseRepeat, setPassphraseRepeat] = useState("");
  const [busy, setBusy] = useState<"backup" | "restore" | "save" | null>(null);

  const savedPassword = Boolean(settings[SETTING_KEYS.syncWebdavPassword]);

  useEffect(() => {
    setKind(syncKind(settings));
    setFolder(settings[SETTING_KEYS.syncFolder] ?? "");
    setWebdavUrl(settings[SETTING_KEYS.syncWebdavUrl] ?? "");
    setUsername(settings[SETTING_KEYS.syncWebdavUser] ?? "");
    setFileName(syncFileName(settings));
  }, [
    settings,
    settings[SETTING_KEYS.syncFolder],
    settings[SETTING_KEYS.syncFileName],
    settings[SETTING_KEYS.syncKind],
    settings[SETTING_KEYS.syncWebdavUrl],
    settings[SETTING_KEYS.syncWebdavUser],
  ]);

  async function currentConfig(): Promise<SyncConfig> {
    const password =
      kind === "webdav"
        ? passwordDraft ||
          (await readSecret(settings, SETTING_KEYS.syncWebdavPassword)) ||
          ""
        : "";
    return {
      kind,
      folder: folder.trim(),
      webdavUrl: webdavUrl.trim(),
      username: username.trim(),
      password,
      fileName: sanitizeSyncFileName(fileName),
    };
  }

  async function persistConfig(password: string): Promise<void> {
    await setSetting(SETTING_KEYS.syncKind, kind);
    await setSetting(SETTING_KEYS.syncFolder, folder.trim());
    await setSetting(SETTING_KEYS.syncWebdavUrl, webdavUrl.trim());
    await setSetting(SETTING_KEYS.syncWebdavUser, username.trim());
    await setSetting(
      SETTING_KEYS.syncFileName,
      sanitizeSyncFileName(fileName),
    );
    if (kind === "webdav" && password) {
      await saveSecret(
        settings,
        setSetting,
        SETTING_KEYS.syncWebdavPassword,
        password,
      );
      setPasswordDraft("");
    }
  }

  async function handleSaveConfig() {
    if (busy) return;
    const config = await currentConfig();
    const issue = validateSyncConfig(config);
    if (issue) {
      notify(issue, "error");
      return;
    }
    setBusy("save");
    try {
      await persistConfig(config.password);
      notify("Sync settings saved");
    } catch (error) {
      console.error("Could not save sync settings", error);
      notify("Could not save sync settings", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleBackup() {
    if (busy) return;
    if (passphrase.length < 8) {
      notify("Use a passphrase of at least 8 characters", "error");
      return;
    }
    if (passphrase !== passphraseRepeat) {
      notify("The passphrases do not match", "error");
      return;
    }

    const config = await currentConfig();
    const issue = validateSyncConfig(config);
    if (issue) {
      notify(issue, "error");
      return;
    }

    setBusy("backup");
    try {
      await persistConfig(config.password);
      const contents = await buildEncryptedBackup(passphrase);
      const location = await uploadBackup(config, contents);
      setPassphrase("");
      setPassphraseRepeat("");
      notify(`Encrypted backup saved to ${location}`);
    } catch (error) {
      console.error("Backup failed", error);
      notify(
        error instanceof Error ? error.message : "Backup failed",
        "error",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore() {
    if (busy) return;
    if (!passphrase) {
      notify("Enter the backup passphrase", "error");
      return;
    }
    if (
      !window.confirm(
        "Restore replaces all goals, entries, reviews and cards on this device with the backup. Continue?",
      )
    ) {
      return;
    }

    const config = await currentConfig();
    const issue = validateSyncConfig(config);
    if (issue) {
      notify(issue, "error");
      return;
    }

    setBusy("restore");
    try {
      const contents = await downloadBackup(config);
      const bundle = await readEncryptedBackup(contents, passphrase);
      const summary = await restoreBundle(bundle);
      await hydrate(true);
      setPassphrase("");
      setPassphraseRepeat("");
      notify(
        `Restored ${summary.entries} entries and ${summary.goals} goals`,
      );
    } catch (error) {
      console.error("Restore failed", error);
      notify(
        error instanceof Error ? error.message : "Restore failed",
        "error",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <SectionTitle>Sync</SectionTitle>
      <Card className="space-y-3">
        <p className="text-[10.5px] leading-relaxed text-muted">
          Optional end-to-end encrypted backups. Backup and restore only run when
          you press a button; Striker never syncs in the background.
        </p>

        <Segmented
          value={kind}
          options={[
            { value: "folder", label: "Local folder" },
            { value: "webdav", label: "WebDAV" },
          ]}
          onChange={setKind}
        />

        {kind === "folder" ? (
          <Field label="Backup folder" htmlFor="sync-folder" hint="absolute path">
            <TextInput
              id="sync-folder"
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              placeholder="D:\\Backups\\Striker"
              maxLength={500}
            />
          </Field>
        ) : (
          <div className="space-y-2.5">
            <Field label="WebDAV folder URL" htmlFor="sync-url" hint="https">
              <TextInput
                id="sync-url"
                value={webdavUrl}
                onChange={(event) => setWebdavUrl(event.target.value)}
                placeholder="https://example.com/remote.php/dav/files/me/striker/"
                inputMode="url"
                maxLength={1_000}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Username" htmlFor="sync-user">
                <TextInput
                  id="sync-user"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="me"
                  autoComplete="username"
                  maxLength={200}
                />
              </Field>
              <Field
                label="Password"
                htmlFor="sync-password"
                hint={savedPassword ? "saved · encrypted" : "optional"}
              >
                <TextInput
                  id="sync-password"
                  type="password"
                  value={passwordDraft}
                  onChange={(event) => setPasswordDraft(event.target.value)}
                  placeholder={savedPassword ? "Saved" : "App password"}
                  autoComplete="off"
                  maxLength={500}
                />
              </Field>
            </div>
          </div>
        )}

        <Field label="Backup file" htmlFor="sync-file" hint=".striker">
          <TextInput
            id="sync-file"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="striker-backup.striker"
            maxLength={120}
          />
        </Field>

        <Button
          variant="subtle"
          className="h-8 w-full text-[11px]"
          onClick={() => void handleSaveConfig()}
          disabled={busy !== null}
        >
          {busy === "save" ? "Saving…" : "Save sync settings"}
        </Button>

        <div className="space-y-2.5 border-t border-line pt-2.5">
          <Field
            label="Backup passphrase"
            htmlFor="sync-passphrase"
            hint="min 8 characters"
          >
            <TextInput
              id="sync-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Used to encrypt and decrypt"
              autoComplete="new-password"
              maxLength={500}
            />
          </Field>
          <Field label="Repeat passphrase" htmlFor="sync-passphrase-repeat">
            <TextInput
              id="sync-passphrase-repeat"
              type="password"
              value={passphraseRepeat}
              onChange={(event) => setPassphraseRepeat(event.target.value)}
              placeholder="Repeat for a new backup"
              autoComplete="new-password"
              maxLength={500}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-9 px-2 text-[11px]"
              onClick={() => void handleBackup()}
              disabled={busy !== null}
            >
              {busy === "backup" ? "Encrypting…" : "Backup now"}
            </Button>
            <Button
              variant="subtle"
              className="h-9 px-2 text-[11px]"
              onClick={() => void handleRestore()}
              disabled={busy !== null}
            >
              {busy === "restore" ? "Restoring…" : "Restore backup"}
            </Button>
          </div>

          <p className="text-[9.5px] leading-relaxed text-muted">
            The passphrase is never stored. Without it the backup cannot be
            recovered. Restore replaces local data; evidence files copied on
            another PC will not exist on this one.
          </p>
        </div>
      </Card>
    </section>
  );
}
