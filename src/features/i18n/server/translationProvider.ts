import "server-only";

import { translateWithLibreTranslate } from "@/features/i18n/server/libreTranslate";
import { serverEnv } from "@/lib/env/server";

export type TranslationProviderName = "libretranslate";

export type TranslateTextArgs = {
  text: string;
  sourceLocale: string;
  targetLocale: string;
};

export type TranslateTextResult = {
  translatedText: string;
  provider: TranslationProviderName;
};

export type TranslationProviderBatchCapability = {
  supported: false;
  reason: "not_implemented";
};

export type TranslationProviderHealthCapability = {
  supported: true;
  probe: "languages";
};

export type TranslationProviderCapabilities = {
  batch: TranslationProviderBatchCapability;
  health: TranslationProviderHealthCapability;
};

export type TranslationProviderMetadata = {
  name: TranslationProviderName;
  capabilities: TranslationProviderCapabilities;
};

type TranslationProviderDriver = {
  metadata: TranslationProviderMetadata;
  translate: (args: TranslateTextArgs) => Promise<TranslateTextResult | null>;
};

const DEFAULT_PROVIDER: TranslationProviderName = "libretranslate";

const PROVIDERS: Record<TranslationProviderName, TranslationProviderDriver> = {
  libretranslate: {
    metadata: {
      name: "libretranslate",
      capabilities: {
        batch: {
          supported: false,
          reason: "not_implemented",
        },
        health: {
          supported: true,
          probe: "languages",
        },
      },
    },
    translate: async (args) => {
      const result = await translateWithLibreTranslate(args);

      if (!result) {
        return null;
      }

      return {
        translatedText: result.translatedText,
        provider: "libretranslate",
      };
    },
  },
};

let hasLoggedInvalidProvider = false;

function normalizeProviderName(
  value: string | null | undefined,
): TranslationProviderName {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "libretranslate") {
    return "libretranslate";
  }

  if (normalized && !hasLoggedInvalidProvider) {
    hasLoggedInvalidProvider = true;
    console.warn("[translationProvider]", {
      event: "translation.provider.invalid_config",
      configuredProvider: normalized,
      fallbackProvider: DEFAULT_PROVIDER,
    });
  }

  return DEFAULT_PROVIDER;
}

function getProviderDriver() {
  const providerName = normalizeProviderName(serverEnv.translation.provider());
  return PROVIDERS[providerName];
}

export function getTranslationProviderName(): TranslationProviderName {
  return getProviderDriver().metadata.name;
}

export function getTranslationProviderMetadata(): TranslationProviderMetadata {
  return getProviderDriver().metadata;
}

export async function translateText(
  args: TranslateTextArgs,
): Promise<TranslateTextResult | null> {
  return getProviderDriver().translate(args);
}
