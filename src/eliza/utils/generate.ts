import { createOpenAI } from '@ai-sdk/openai';
import {
  elizaLogger,
  IAgentRuntime,
  ModelProviderName,
  models,
  settings,
  trimTokens,
} from '@ai16z/eliza';
import { streamText } from 'ai';

export async function generateMessageResponseSSE({
  runtime,
  context,
  modelClass,
  sendChunk,
}: {
  runtime: IAgentRuntime;
  context: string;
  modelClass: string;
  sendChunk: (chunk: string) => void;
}): Promise<string> {
  const max_context_length =
    models[runtime.modelProvider].settings.maxInputTokens;
  context = trimTokens(context, max_context_length, 'gpt-4o');
  let retryLength = 1000;
  let fullResponse = '';

  while (true) {
    try {
      elizaLogger.log('Generating message response...');
      fullResponse = await generateTextSSE({
        runtime,
        context,
        modelClass,
        sendChunk,
      });
      break;
    } catch (error) {
      elizaLogger.error('ERROR:', error);
      retryLength *= 2;
      await new Promise((resolve) => setTimeout(resolve, retryLength));
      elizaLogger.debug('Retrying...');
    }
  }

  return fullResponse;
}

export async function generateTextSSE({
  runtime,
  context,
  modelClass,
  sendChunk,
}: {
  runtime: IAgentRuntime;
  context: string;
  modelClass: string;
  sendChunk: (chunk: string) => void;
}): Promise<string> {
  if (!context) {
    console.error('generateText context is empty');
    sendChunk('Error: Context is empty');
    return '';
  }

  elizaLogger.log('Generating text...');
  const provider = runtime.modelProvider;
  const endpoint =
    runtime.character.modelEndpointOverride || models[provider].endpoint;
  let model = models[provider].model[modelClass];

  if (
    runtime.getSetting('LLAMACLOUD_MODEL_LARGE') &&
    provider === ModelProviderName.LLAMACLOUD
  ) {
    model = runtime.getSetting('LLAMACLOUD_MODEL_LARGE');
  }

  if (
    runtime.getSetting('LLAMACLOUD_MODEL_SMALL') &&
    provider === ModelProviderName.LLAMACLOUD
  ) {
    model = runtime.getSetting('LLAMACLOUD_MODEL_SMALL');
  }

  const temperature = models[provider].settings.temperature;
  const frequency_penalty = models[provider].settings.frequency_penalty;
  const presence_penalty = models[provider].settings.presence_penalty;
  const max_response_length = models[provider].settings.maxOutputTokens;

  const apiKey = runtime.token;
  let fullResponse = '';

  try {
    elizaLogger.debug(
      `Trimming context to max length of ${models[provider].settings.maxInputTokens} tokens.`,
    );
    context = await trimTokens(
      context,
      models[provider].settings.maxInputTokens,
      'gpt-4o',
    );

    switch (provider) {
      case ModelProviderName.OPENAI:
      case ModelProviderName.LLAMACLOUD: {
        elizaLogger.debug('Initializing OpenAI model.');
        const openai = createOpenAI({ apiKey, baseURL: endpoint });

        const res = streamText({
          model: openai.languageModel(model),
          prompt: context,
          system:
            runtime.character.system ?? settings.SYSTEM_PROMPT ?? undefined,
          temperature: temperature,
          maxTokens: max_response_length,
          frequencyPenalty: frequency_penalty,
          presencePenalty: presence_penalty,
        });

        for await (const textPart of res.textStream) {
          fullResponse += textPart;
          if (
            fullResponse.includes('START###') &&
            !fullResponse.includes('###END')
          ) {
            sendChunk(textPart.replaceAll('#', ''));
          }
        }

        elizaLogger.debug('Completed response from OpenAI model.');
        break;
      }

      default: {
        const errorMessage = `Unsupported provider: ${provider}`;
        elizaLogger.error(errorMessage);
        throw new Error(errorMessage);
      }
    }
  } catch (error) {
    elizaLogger.error('Error in generateTextSSE:', error);
    sendChunk(`Error: ${error.message}`);
    throw error;
  }

  return fullResponse.replace(/START###/g, '').replace(/###END/g, '');
}
