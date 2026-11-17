import type http from 'http';
import { LiveServerMessage, Modality } from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import {
  buildSystemInstruction,
  coDriverTools,
  executeCoDriverTool,
  formatCoDriverError,
  getGeminiClient,
} from './coDriverService';

interface AttachLiveOptions {
  server: http.Server;
  getDb: () => any;
  broadcastEvent: (eventName: string, data: any) => void;
}

export function attachCoDriverLiveWebSocket({ server, getDb, broadcastEvent }: AttachLiveOptions) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname !== '/ws/codriver-live') {
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    let liveSession: any = null;
    let isClosed = false;

    const sendToClient = (payload: Record<string, any>) => {
      if (!isClosed && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    try {
      const ai = getGeminiClient();
      const systemInstruction = buildSystemInstruction(getDb());

      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: coDriverTools }],
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            sendToClient({ type: 'ready', model: 'gemini-3.8-live' });
          },
          onmessage: async (message: LiveServerMessage) => {
            if (isClosed) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              sendToClient({
                type: 'input_transcript',
                text: content.inputTranscription.text,
              });
            }

            if (content?.outputTranscription?.text) {
              sendToClient({
                type: 'output_transcript',
                text: content.outputTranscription.text,
              });
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendToClient({
                  type: 'audio',
                  data: part.inlineData.data,
                });
              }
            }

            if (content?.interrupted) {
              sendToClient({ type: 'interrupted' });
            }

            if (content?.turnComplete) {
              sendToClient({ type: 'turn_complete' });
            }

            const toolCalls = message.toolCall?.functionCalls;
            if (toolCalls && toolCalls.length > 0 && liveSession) {
              const responses = await Promise.all(
                toolCalls.map(async (call) => {
                  const exec = await executeCoDriverTool(
                    call.name || '',
                    (call.args || {}) as Record<string, any>,
                    getDb(),
                    broadcastEvent
                  );
                  if (exec.actionRecord) {
                    sendToClient({
                      type: 'tool_action',
                      action: exec.actionRecord,
                    });
                  }
                  return {
                    id: call.id,
                    name: call.name || '',
                    response: exec.result,
                  };
                })
              );

              try {
                liveSession.sendToolResponse({
                  functionResponses: responses,
                });
              } catch (err) {
                sendToClient({
                  type: 'error',
                  message: formatCoDriverError(err, 'Failed to return tool response to Gemini Live.'),
                });
              }
            }
          },
          onerror: (err: any) => {
            sendToClient({
              type: 'error',
              message: formatCoDriverError(err, 'Gemini Live session error.'),
            });
          },
          onclose: () => {
            if (!isClosed) {
              sendToClient({ type: 'closed' });
            }
          },
        },
      });
    } catch (err: any) {
      sendToClient({
        type: 'error',
        message: formatCoDriverError(err, 'Unable to start Gemini Live Co-Driver session.'),
      });
      clientWs.close();
      return;
    }

    clientWs.on('message', (rawData) => {
      if (isClosed || !liveSession) return;
      try {
        const msg = JSON.parse(rawData.toString());
        if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          liveSession.sendRealtimeInput({
            text: msg.text.trim(),
          });
        } else if (msg.type === 'context_event' && typeof msg.details === 'string') {
          liveSession.sendRealtimeInput({
            text: `[PROACTIVE SYSTEM CONTEXT EVENT: ${msg.eventType || 'ROUTE_UPDATE'}] ${msg.details}. Speak 1 short natural sentence alerting the driver in their language and suggest the smartest next step.`,
          });
        }
      } catch (err) {
        sendToClient({
          type: 'error',
          message: formatCoDriverError(err, 'Failed to stream input to Gemini Live.'),
        });
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      try {
        liveSession?.close?.();
      } catch {
        // Ignore close cleanup errors
      }
      liveSession = null;
    });
  });
}
