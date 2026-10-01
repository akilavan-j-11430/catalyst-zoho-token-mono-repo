import { Router } from "express";
import { authRouter } from "@/routes/auth";
import { pingRouter } from "@/routes/ping";
import { zohoTokenRouter } from "@/routes/zoho-token";

/** Every /api route. Mounting lives here so `index.ts` never grows a line per feature, and
 *  so a new router cannot land below the catch-all 404 and quietly stop existing. */
export const apiRouter: Router = Router();

apiRouter.use(pingRouter);
apiRouter.use(authRouter);
apiRouter.use(zohoTokenRouter);
