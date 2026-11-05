// Public API of @nexastack/shared. Export explicitly; never `export *`.

// Schemas
export { contactFormSchema, contactSchema } from './schemas/contact.js';
export {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  adminRoleChangeSchema,
  adminStatusChangeSchema,
  changePasswordFormSchema,
  changePasswordSchema,
  createAdminUserSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from './schemas/auth.js';
export {
  BLOG_BODY_MAX,
  BLOG_BODY_MIN,
  BLOG_EXCERPT_MAX,
  BLOG_EXCERPT_MIN,
  BLOG_TAG_MAX_LENGTH,
  BLOG_TAGS_MAX,
  BLOG_TITLE_MAX,
  blogCategoryFormSchema,
  blogPostFormSchema,
  blogPostListQuerySchema,
} from './schemas/blog.js';
export {
  ENQUIRY_NOTE_MAX,
  ENQUIRY_NOTES_MAX,
  enquiryNoteSchema,
  enquiryStatusChangeSchema,
} from './schemas/enquiry.js';
export {
  OBJECT_ID_PATTERN,
  SLUG_PATTERN,
  contentListQuerySchema,
  contentStatusTransitionSchema,
  emptyToUndefined,
  objectIdSchema,
  paginationQuerySchema,
  reorderSchema,
  slugSchema,
} from './schemas/content.js';
export {
  ATTACHMENT_ACCEPTED_EXTENSIONS,
  ATTACHMENT_ACCEPTED_TYPES,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_MAX_SIZE_BYTES,
  ATTACHMENT_SIZE_LABEL,
  ATTACHMENT_SIZE_ERROR,
  ATTACHMENT_MAX_REQUEST_BYTES,
  ATTACHMENT_REQUEST_SIZE_ERROR,
  attachmentSizeSchema,
  quotationUploadAuthorizationSchema,
  quotationUploadIdSchema,
  quotationUploadRemovalSchema,
  BUDGET_RANGE_OPTIONS,
  DESIGN_REQUIREMENTS_OPTIONS,
  MAINTENANCE_OPTIONS,
  NUMBER_OF_PAGES_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  REQUIRED_SERVICE_OPTIONS,
  quotationSchema,
  quotationStep1Schema,
  quotationStep2Schema,
  quotationStep3Schema,
  quotationStep4Schema,
} from './schemas/quotation.js';
export {
  mediaAltTextSchema,
  mediaDeleteSchema,
  mediaDescriptionSchema,
  mediaDocumentMetadataSchema,
  mediaImageMetadataSchema,
} from './schemas/media.js';
export {
  QUOTATION_NOTE_MAX,
  QUOTATION_NOTES_MAX,
  quotationNoteSchema,
  quotationStatusChangeSchema,
} from './schemas/quotationAdmin.js';

// Types
export type {
  AdminRoleChangeInput,
  AdminStatusChangeInput,
  AdminUserAdmin,
  AdminUserCreated,
  AdminAuditEntry,
  AuthenticatedAdmin,
  ChangePasswordFormValues,
  ChangePasswordInput,
  CreateAdminUserInput,
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
} from './types/auth.js';
export type {
  BlogCategoryAdmin,
  BlogCategoryFormValues,
  BlogCategoryInput,
  BlogPostAdminDetail,
  BlogPostAdminSummary,
  BlogPostFormValues,
  BlogPostInput,
  BlogPostListQuery,
  BlogTocItem,
} from './types/blog.js';
export type {
  EnquiryAdminDetail,
  EnquiryAdminSummary,
  EnquiryNoteAdmin,
  EnquiryNoteInput,
  EnquiryStatusChangeInput,
} from './types/enquiry.js';
export type {
  ContentListQuery,
  ContentStatusTransitionInput,
  Paginated,
  ReorderInput,
} from './types/content.js';
export type {
  ContactFormValues,
  ContactInput,
  ContactPageFormValues,
  ContactPageInput,
} from './types/contact.js';
export type {
  QuotationFormValues,
  QuotationInput,
  QuotationStep1Input,
  QuotationStep2Input,
  QuotationStep3Input,
  QuotationStep4Input,
} from './types/quotation.js';
export type { MediaAdmin, MediaDeleteInput, MediaUsageAdmin } from './types/media.js';
export type {
  QuotationAdminDetail,
  QuotationAdminSummary,
  QuotationAttachmentAdmin,
  QuotationNoteAdmin,
  QuotationNoteInput,
  QuotationStatusChangeInput,
} from './types/quotationAdmin.js';
export type {
  ApiErrorBody,
  ApiFailure,
  ApiResponse,
  ApiSuccess,
  ValidationIssue,
} from './types/api.js';

// Constants
export { ROLES, roleSchema, type Role } from './constants/roles.js';
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasAnyPermission,
  hasPermission,
  permissionsFor,
  type Permission,
} from './constants/permissions.js';
export { ADMIN_EVENT_TYPES, type AdminEventType } from './constants/adminEvents.js';
export {
  ADMIN_LOCK_MESSAGES,
  ADMIN_STATUS,
  ADMIN_STATUSES,
  adminStatusSchema,
  type AdminLockReason,
  type AdminStatus,
} from './constants/adminStatus.js';
export {
  CONTENT_STATUS,
  CONTENT_STATUS_TRANSITIONS,
  CONTENT_STATUSES,
  canTransition,
  contentStatusSchema,
  getAvailableTransitions,
  type ContentStatus,
} from './constants/contentStatus.js';
export {
  ENQUIRY_ATTENTION_STATUSES,
  ENQUIRY_STATUS,
  ENQUIRY_STATUS_TRANSITIONS,
  ENQUIRY_STATUSES,
  canTransitionEnquiry,
  enquiryStatusSchema,
  getAvailableEnquiryTransitions,
  type EnquiryStatus,
} from './constants/enquiryStatus.js';
export {
  MEDIA_ACCEPT_ATTRIBUTE,
  MEDIA_ACCEPTED_EXTENSIONS,
  MEDIA_ACCEPTED_MIME_TYPES,
  MEDIA_ALLOWED_TYPES_TEXT,
  MEDIA_ALT_TEXT_MAX,
  MEDIA_ALT_TEXT_MIN,
  MEDIA_DESCRIPTION_MAX,
  MEDIA_DOCUMENT_MIME_TYPES,
  MEDIA_FILENAME_MAX,
  MEDIA_IMAGE_MIME_TYPES,
  MEDIA_MAX_DIMENSION,
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_PAGE_SIZE,
  MEDIA_PDF_MAX_BYTES,
  MEDIA_RASTER_MAX_BYTES,
  MEDIA_SVG_MAX_BYTES,
  MEDIA_TYPE,
  MEDIA_TYPES,
  maxBytesForMime,
  mediaTypeForMime,
  mediaTypeSchema,
  type MediaDocumentMimeType,
  type MediaImageMimeType,
  type MediaMimeType,
  type MediaType,
} from './constants/media.js';
export {
  QUOTATION_ATTENTION_STATUSES,
  QUOTATION_STATUS,
  QUOTATION_STATUS_TRANSITIONS,
  QUOTATION_STATUSES,
  canTransitionQuotation,
  getAvailableQuotationTransitions,
  quotationStatusSchema,
  type QuotationStatus,
} from './constants/quotationStatus.js';
export { ERROR_CODES, type ErrorCode } from './constants/errorCodes.js';
export { COUNTRIES } from './constants/countries.js';

// Pure, environment-agnostic helpers that must behave identically in both apps
export { sniffFileType, type SniffedFileType } from './utils/sniffFileType.js';
export { findUnsafeArticleHtml, isSafeUrl } from './utils/articleHtml.js';
