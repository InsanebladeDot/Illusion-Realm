/** Verify the shared image/video/audio contract without adding fake imports to production tasks. */
const assert = require("node:assert/strict");
const { filterPromptMedia, findPromptReferenceMedia, getMediaMentionQuery, mediaReferenceToken } = require("../apps/next/src/utils/prompt-media-references.ts");
const media = [
  { id: "frame-1", kind: "image", number: 1, name: "first.png", label: "首帧", src: "fixture:first" },
  { id: "frame-2", kind: "image", number: 2, name: "last.png", label: "尾帧", src: "fixture:last" },
  { id: "clip-1", kind: "video", number: 1, name: "walk.mp4", src: "fixture:video" },
  { id: "audio-1", kind: "audio", number: 1, name: "voice.wav", src: "fixture:audio" },
];
assert.deepEqual(filterPromptMedia(media, ""), media);
for (const [query, id] of [["尾", "frame-2"], ["last.png", "frame-2"], ["VIDEO", "clip-1"], ["视频", "clip-1"], ["音频", "audio-1"], ["voice", "audio-1"]]) {
  assert.deepEqual(filterPromptMedia(media, query).map(item => item.id), [id]);
}
assert.deepEqual(filterPromptMedia(media, "missing"), []);
for (const item of media) assert.equal(findPromptReferenceMedia(mediaReferenceToken(item), media), item);
assert.equal(findPromptReferenceMedia("@视频1", media), media[2]);
assert.equal(findPromptReferenceMedia("@音频1", media), media[3]);
assert.equal(findPromptReferenceMedia("@图2", media), media[1]);
assert.equal(findPromptReferenceMedia("@image2", media.filter(item => item.number !== 2)), undefined);
assert.deepEqual(getMediaMentionQuery("prefix @ suffix", 8), { start: 7, end: 8, query: "" });
assert.deepEqual(getMediaMentionQuery("@voice", 6), { start: 0, end: 6, query: "voice" });
assert.equal(getMediaMentionQuery("email@example.com", 17), null);
assert.equal(getMediaMentionQuery("@image1", 7), null);
assert.equal(getMediaMentionQuery("@audio1", 7), null);
assert.equal(getMediaMentionQuery("@video1", 7), null);
assert.equal(getMediaMentionQuery("@ query", 7), null);
console.log("PASS  Shared media references: image/video/audio search, aliases, insertion IDs, caret queries and missing assets");
