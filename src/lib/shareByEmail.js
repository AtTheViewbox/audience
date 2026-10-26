const SHARE_FUNCTION = "shareStudy-ts";

async function messageFromInvokeError(error) {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
    if (body?.message) return body.message;
  } catch {
    // response body was not JSON
  }
  return error?.message || "Could not share";
}

async function shareByEmail(supabaseClient, { email, studyId, seriesId, playlistId }) {
  const body = { email };
  if (studyId) body.studyId = studyId;
  if (seriesId) body.seriesId = seriesId;
  if (playlistId) body.playlistId = playlistId;

  const { data, error } = await supabaseClient.functions.invoke(SHARE_FUNCTION, { body });
  if (error) throw new Error(await messageFromInvokeError(error));
  if (data?.error) throw new Error(data.error);
  if (!data?.ok) throw new Error("Could not share");
  return data;
}

/** Copy into their viewbox, then email them or open a mail draft. */
export async function deliverShare(supabaseClient, { email, name, studyId, seriesId, playlistId }) {
  const result = await shareByEmail(supabaseClient, { email, studyId, seriesId, playlistId });
  const label = name || result.name;
  if (!result.emailed) openShareMailDraft({ email, name: label, href: result.href });
  return shareResultMessage(result, { email, name: label });
}

function shareResultMessage(result, { email, name }) {
  const label = name || result?.name || "Item";
  let where = "It’s in their viewbox.";
  if (result?.kind === "series") {
    where = "It’s in their viewbox and in their builder.";
  } else if (result?.kind === "case") {
    const count = result.count || 0;
    where = count === 1
      ? "1 study is in their viewbox, and the case is in their Cases list."
      : `${count} studies are in their viewbox, and the case is in their Cases list.`;
  }
  const mail = result?.emailed
    ? " We emailed them a link."
    : " Outgoing mail isn’t configured, so open the draft in your email app to notify them.";
  return `Shared “${label}” with ${email}. ${where}${mail}`;
}

function openShareMailDraft({ email, name, href }) {
  const subject = `Shared with you on AtTheViewBox: ${name || "a study"}`;
  const body = [
    `I shared “${name || "a study"}” with you on AtTheViewBox.`,
    "It is in your viewbox.",
    href ? `Open it here: ${href}` : "",
  ].filter(Boolean).join("\n\n");
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const link = document.createElement("a");
  link.href = mailto;
  link.rel = "noopener";
  link.click();
}
