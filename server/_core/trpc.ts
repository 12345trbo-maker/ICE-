import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

const hasAccess = (user: TrpcContext["user"], roles: string[]) => Boolean(user && ((user.accessRole && roles.includes(user.accessRole)) || (!user.accessRole && user.role === "admin" && roles.includes("primary_manager"))));

export const primaryManagerProcedure = t.procedure.use(t.middleware(async opts => {
  if (!hasAccess(opts.ctx.user, ["primary_manager"])) throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية متاحة للمدير الأساسي فقط" });
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user! } });
}));

export const approvalProcedure = t.procedure.use(t.middleware(async opts => {
  if (!hasAccess(opts.ctx.user, ["primary_manager", "assistant_manager"])) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية اعتماد الطلبات" });
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user! } });
}));

export const deductionProcedure = t.procedure.use(t.middleware(async opts => {
  if (!hasAccess(opts.ctx.user, ["primary_manager", "assistant_manager", "supervisor"])) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إعطاء الخصومات" });
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user! } });
}));
