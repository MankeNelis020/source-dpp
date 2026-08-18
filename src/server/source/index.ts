import { getMemoryPersistence } from "@/infrastructure/database/memory";
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
} from "@/server/source/queries";
import { createImportJob, getImportProgress } from "@/server/source/import/service";

export const sourceApp = {
  store: () => getMemoryPersistence(),
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
};
