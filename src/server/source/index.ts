import { getPersistence } from "@/infrastructure/runtime";
import { dispatchCommand, resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { resolvePortalPrincipal } from "@/server/source/portal";
import {
  getCaseDetail,
  getCaseList,
  getNeedsYouTasks,
  getProductBlockers,
  getProductDetail,
  getResolutionWorkboard,
  getSupplierPortalView,
  getWorkspaceOverview,
  searchTenant,
  getPilotResults,
  getMaterialDetail,
  getSupplierOverview,
} from "@/server/source/queries";
import { createImportJob, getImportProgress } from "@/server/source/import/service";
import { executeResolutionRun } from "@/server/source/resolution-run";

export const sourceApp = {
  store: () => getPersistence(),
  dispatchCommand,
  resolveUserPrincipal,
  resolvePortalPrincipal,
  getWorkspaceOverview,
  getResolutionWorkboard,
  getCaseList,
  getCaseDetail,
  getNeedsYouTasks,
  getProductBlockers,
  getProductDetail,
  getSupplierPortalView,
  searchTenant,
  createImportJob,
  getImportProgress,
  getPilotResults,
  getMaterialDetail,
  getSupplierOverview,
  executeResolutionRun,
};
