import { useEffect, useState } from "react";
import { saveSecret } from "../../lib/secrets";
import {
  SETTING_KEYS,
  aiProvider,
  type AiProvider,
} from "../../lib/settings";
import { useAppStore } from "../../store/useAppStore";
import {
  Button,
  Card,
  Field,
  SectionTitle,
  Segmented,
  TextInput,
} from "../ui";

export function AiSettings() {
  const settings = useAppStore((state) => state.settings);
  const setSetting = useAppStore((state) => state.setSetting);
  const notify = useAppStore((state) => state.notify);

  const [provider, setProvider] = useState<AiProvider>(aiProvider(settings));
  const [baseUrl, setBaseUrl] = useState(
    settings[SETTING_KEYS.aiBaseUrl] ?? "",
  );
  const [model, setModel] = useState(settings[SETTING_KEYS.aiModel] ?? "");
  const [keyDraft, setKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const savedKey = Boolean(settings[SETTING_KEYS.aiApiKey]);

  useEffect(() => {
    setProvider(aiProvider(settings));
    setBaseUrl(settings[SETTING_KEYS.aiBaseUrl] ?? "");
    setModel(settings[SETTING_KEYS.aiModel] ?? "");
  }, [
    settings,
    settings[SETTING_KEYS.aiBaseUrl],
    settings[SETTING_KEYS.aiApiKey],
    settings[SETTING_KEYS.aiModel],
    settings[SETTING_KEYS.aiProvider],
  ]);

  const defaultBase =
    provider === "openai"
      ? "https://api.openai.com/v1"
      : "http://localhost:11434";
  const defaultModel = provider === "openai" ? "gpt-4o-mini" : "llama3.1";

  async function handleSave() {
    if (saving) return;
    const nextModel = model.trim();
    const nextBase = baseUrl.trim().replace(/\/+$/, "");

    if (!nextModel) {
      notify("Add an AI model name", "error");
      return;
    }
    if (nextBase && !/^https?:\/\//i.test(nextBase)) {
      notify("The base URL must start with http:// or https://", "error");
      return;
    }
    if (provider === "openai" && !keyDraft.trim() && !savedKey) {
      notify("Add an OpenAI-compatible API key", "error");
      return;
    }

    setSaving(true);
    try {
      await setSetting(SETTING_KEYS.aiProvider, provider);
      await setSetting(SETTING_KEYS.aiBaseUrl, nextBase);
      await setSetting(SETTING_KEYS.aiModel, nextModel);
      if (keyDraft.trim()) {
        await saveSecret(
          settings,
          setSetting,
          SETTING_KEYS.aiApiKey,
          keyDraft.trim(),
        );
        setKeyDraft("");
      }
      notify("AI settings saved");
    } catch (error) {
      console.error("Could not save AI settings", error);
      notify("Could not save AI settings", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearKey() {
    try {
      await setSetting(SETTING_KEYS.aiApiKey, "");
      setKeyDraft("");
      notify("Stored AI key removed");
    } catch (error) {
      console.error("Could not clear the AI key", error);
      notify("Could not clear the AI key", "error");
    }
  }

  return (
    <section>
      <SectionTitle>AI summarization</SectionTitle>
      <Card className="space-y-3">
        <p className="text-[10.5px] leading-relaxed text-muted">
          “Summarize week” sends only the selected week’s entries to your chosen
          endpoint and returns key learnings, suggestions and open questions.
          Nothing runs automatically.
        </p>

        <Segmented
          value={provider}
          options={[
            { value: "ollama", label: "Ollama (local)" },
            { value: "openai", label: "OpenAI-compatible" },
          ]}
          onChange={setProvider}
        />

        <Field label="Base URL" htmlFor="ai-base" hint="optional">
          <TextInput
            id="ai-base"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={defaultBase}
            inputMode="url"
            maxLength={500}
          />
        </Field>

        <Field label="Model" htmlFor="ai-model">
          <TextInput
            id="ai-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={defaultModel}
            maxLength={120}
          />
        </Field>

        <Field
          label="API key"
          htmlFor="ai-key"
          hint={savedKey ? "saved · encrypted" : "not set"}
        >
          <TextInput
            id="ai-key"
            type="password"
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
            placeholder={
              savedKey
                ? "Type to replace the saved key"
                : provider === "openai"
                  ? "sk-…"
                  : "Optional for Ollama"
            }
            autoComplete="off"
            maxLength={500}
          />
        </Field>

        <div className="flex gap-2">
          <Button
            className="h-9 flex-1 text-[12px]"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save AI settings"}
          </Button>
          {savedKey ? (
            <Button
              variant="subtle"
              className="h-9 px-3 text-[11px]"
              onClick={() => void handleClearKey()}
            >
              Clear key
            </Button>
          ) : null}
        </div>

        <p className="text-[9.5px] leading-relaxed text-muted">
          The key is encrypted with AES-256-GCM before it is stored. Ollama
          should be running locally; OpenAI-compatible endpoints must accept{" "}
          <code>/chat/completions</code>. Requests use the native HTTP plugin,
          so the webview’s CORS policy does not block them.
        </p>
      </Card>
    </section>
  );
}
