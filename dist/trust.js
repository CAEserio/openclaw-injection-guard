function tagContent(text, source) {
  const trust = source === "user_message" ? "trusted" : "untrusted";
  return { text, source, trust };
}
export {
  tagContent
};
