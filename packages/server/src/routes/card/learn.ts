import { Hono } from "hono";
import { resolveGameKeyAndLang } from "../../lib/card-search/resolve";
import { requireAuth, requireOrg, type AppEnv } from "../../middleware/auth";
import { learnCardFromImage } from "../admin/shared";

/**
 * POST /learn (multipart: image, cardId, collectionGuid): store a card the sync source lists
 * without a picture, with the scanned card as its picture, in the collection's game and
 * language. The scanner calls it when an external identifier names a card the catalog lacks.
 */
export const learnCardRoute = new Hono<AppEnv>().post(
  "/learn",
  requireAuth,
  requireOrg,
  async (c) => {
    const body = await c.req.parseBody();
    const file = body["image"];
    const cardId = body["cardId"];
    const collectionGuid =
      typeof body["collectionGuid"] === "string"
        ? body["collectionGuid"]
        : undefined;

    if (!file || typeof file === "string" || !file.type.startsWith("image/")) {
      return c.json({ success: false, message: "No image provided." }, 400);
    }
    if (typeof cardId !== "string" || cardId === "") {
      return c.json({ success: false, message: "No card id provided." }, 400);
    }
    const resolved = await resolveGameKeyAndLang(
      c.get("jwtClaims"),
      collectionGuid,
    );
    if (!resolved) {
      return c.json(
        { success: false, message: "No game configured for this collection." },
        400,
      );
    }
    const result = await learnCardFromImage(
      resolved.gameKey,
      cardId,
      resolved.lang,
      Buffer.from(await file.arrayBuffer()),
    );
    if (!result.success) {
      return c.json(
        { success: false, message: result.message },
        result.status,
      );
    }
    return c.json(result);
  },
);
