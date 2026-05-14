function parseMentionCommand(content, botId) {
  if (!content || !botId) {
    return null;
  }

  const trimmed = content.trim();
  const mentionMatch = trimmed.match(/^<@!?(\d+)>\s+([\s\S]+)$/);
  if (!mentionMatch || mentionMatch[1] !== botId) {
    return null;
  }

  const body = mentionMatch[2].trim();
  if (!body) {
    return null;
  }

  const normalized = body.startsWith("!") ? body.slice(1) : body;
  const [commandRaw, ...argParts] = normalized.split(/\s+/);
  if (!commandRaw) {
    return null;
  }

  return {
    command: commandRaw.toLowerCase(),
    args: argParts.join(" ").trim(),
  };
}

module.exports = {
  parseMentionCommand,
};
