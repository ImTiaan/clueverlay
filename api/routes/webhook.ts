import { Router, type Request, type Response } from 'express';
import { parseChatCommand } from '../lib/commandParser.js';
import { processChatCommand } from '../lib/gameService.js';
import { sendChatMessage } from '../lib/twitchApi.js';
import { getActorRoles, getEventSubMessageType, verifyEventSubSignature, type EventSubEnvelope } from '../lib/twitch.js';

const router = Router();

router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const messageType = getEventSubMessageType(req.headers);
  const payload = req.body as EventSubEnvelope;

  if (!verifyEventSubSignature(req.headers, req.rawBody ?? JSON.stringify(payload))) {
    res.status(403).json({
      success: false,
      error: 'Invalid EventSub signature.',
    });
    return;
  }

  if (messageType === 'webhook_callback_verification') {
    res.status(200).type('text/plain').send(payload.challenge ?? '');
    return;
  }

  if (messageType === 'revocation') {
    res.status(204).send();
    return;
  }

  if (!payload.event) {
    res.status(200).json({
      success: true,
      handled: false,
    });
    return;
  }

  const parsedCommand = parseChatCommand(payload.event.message.text);

  if (!parsedCommand) {
    res.status(200).json({
      success: true,
      handled: false,
    });
    return;
  }

  try {
    const actorRoles = getActorRoles(payload.event);
    const result = await processChatCommand(
      {
        userId: payload.event.chatter_user_id,
        userName: payload.event.chatter_user_name,
        isBroadcaster: actorRoles.isBroadcaster,
        isModerator: actorRoles.isModerator,
      },
      parsedCommand,
    );

    let outbound: { sent: boolean; reason?: string } | null = null;

    if (result.handled && result.message) {
      try {
        const sent = await sendChatMessage(result.message);
        outbound = {
          sent: sent.isSent,
          reason: sent.dropReason?.message,
        };
      } catch (sendError) {
        outbound = {
          sent: false,
          reason: sendError instanceof Error ? sendError.message : 'Unable to send Twitch chat message.',
        };
      }
    }

    res.status(200).json({
      success: true,
      handled: result.handled,
      reply: result.message,
      outbound,
    });
  } catch (_error) {
    res.status(500).json({
      success: false,
      error: 'Unable to process chat webhook.',
    });
  }
});

export default router;
