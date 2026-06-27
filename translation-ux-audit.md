# Translation UX Audit

Compared the listed locale files against `messages/en.json` and reviewed exact English leftovers that are likely user-visible.

What I excluded from this audit:
- Product and provider names such as `Lumo`, `Faigata`, `Gmail / Google Workspace`, `Google Calendar`, `Stripe (Test)`
- Social network / platform brand names such as `WhatsApp`, `TikTok`, `LinkedIn`
- Example emails, URLs, slugs, and similar placeholders
- Obvious technical tokens like `LINE`, `DM`, `SMS`, `URL`

This is a review list only. No translations were changed.

## `messages/en.json`

- Source locale. No action needed.

## `messages/ar.json`

- Team/member role labels are still English:
  `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`
- Role management labels are still English:
  `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`
- Onboarding invite roles are still English:
  `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`
- Region options still contain English text:
  `OnboardingPage.customFields.defaults.regionOptions`
- Raw system/payment status still appears in English:
  `BillingPaymentDetailPage.status.requiresPaymentMethod`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/bn.json`

- Billing/payment labels are still English:
  `BillingInvoiceDetailPage.modal.fields.priceId`, `BillingInvoiceDetailPage.modal.modes.price`, `BillingPaymentDetailPage.fields.chargeId`, `BillingPaymentDetailPage.raw.title`, `BillingProductArchivePage.confirm.stripeId`, `BillingProductDetailPage.header.stripeId`
- Billing overview helper text is still English:
  `BillingPage.cards.customers.hint`, `BillingPage.cards.invoices.hint`, `BillingPage.cards.payments.hint`, `BillingPage.cards.products.hint`
- Meeting name defaults are still English:
  `CreateSchedulePage.placeholders.meetingName`, `CreateSchedulePage.previewCard.defaults.meetingName`
- Team/member role labels are still English:
  `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`
- Role management labels are still English:
  `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`
- Onboarding invite roles are still English:
  `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`
- Region options still contain English text:
  `OnboardingPage.customFields.defaults.regionOptions`
- English ID label is still present:
  `EditLeadPage.contact.valueLabel.wechat`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/de.json`

- Main navigation/page labels are still English:
  `AppHeader.reminders.pipelineFallback`, `AppHeader.sections.dashboard`, `AppHeader.sections.leads`, `AppHeader.sections.pipeline`, `AppSidebar.nav.dashboard`, `AppSidebar.nav.leads`, `AppSidebar.nav.pipeline`, `Dashboard.metadata.title`, `Dashboard.page.title`, `LeadsPage.metadata.title`, `LeadsPage.page.title`, `OnboardingPage.metadata.title`, `PipelinePage.metadata.title`, `PipelinePage.page.title`
- Billing/product labels are still English:
  `BillingInvoicesPage.table.columns.status`, `BillingProductDetailPage.details.name`, `BillingProductDetailPage.details.title`, `BillingProductDetailPage.prices.table.status`, `BillingProductDetailPage.statusCard.title`, `BillingProductFormPage.fields.name`, `BillingProductFormPage.placeholders.description`, `BillingProductsPage.table.columns.status`, `BillingProductDetailPage.activity.text.nameChanged`
- Scheduling labels are still English:
  `CreateSchedulePage.hostSelection.oneOnOne.label`, `CreateSchedulePage.placeholders.meetingName`, `CreateSchedulePage.previewCard.defaults.meetingName`
- Dashboard labels are still English:
  `Dashboard.attention.score`, `Dashboard.feed.types.lead`, `Dashboard.filters.team`, `Dashboard.kpis.leads`, `Dashboard.status.live`
- Source category values are still English:
  `DomainValues.crm.sourceCategory.inbound`, `DomainValues.crm.sourceCategory.outbound`, `DomainValues.crm.sourceCategory.partner`, `EditLeadPage.sourceCategory.inbound`, `EditLeadPage.sourceCategory.outbound`, `EditLeadPage.sourceCategory.partner`, `LeadsPage.values.sourceCategoryInbound`, `LeadsPage.values.sourceCategoryOutbound`, `LeadsPage.values.sourceCategoryPartner`
- Role names are still English in multiple places:
  `DomainValues.roles.closer`, `DomainValues.roles.manager`, `DomainValues.roles.setter`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`
- Lead detail/message labels are still English:
  `LeadDetailPage.booking.columns.host`, `LeadDetailPage.booking.host`, `LeadDetailPage.fallback.pipeline`, `LeadDetailPage.fields.closer`, `LeadDetailPage.fields.setter`, `LeadDetailPage.timeline.roleLead`, `LeadDetailPage.timeline.roleTeam`, `LeadMessagesPage.fallback.pipeline`, `LeadMessagesPage.page.leadLabel`, `LeadMessagesPage.timeline.roleLead`, `LeadMessagesPage.timeline.roleTeam`
- Lead field labels/types are still English:
  `LeadFieldsSettingsPage.badges.optional`, `LeadFieldsSettingsPage.fieldTypes.boolean`, `LeadFieldsSettingsPage.fieldTypes.link`, `LeadFieldsSettingsPage.fieldTypes.select`, `LeadFieldsSettingsPage.fieldTypes.text`, `OnboardingPage.customFields.fieldTypes.boolean`, `OnboardingPage.customFields.fieldTypes.select`, `OnboardingPage.customFields.fieldTypes.text`
- Region/brand fallback labels are still English:
  `LeadsPage.columns.region`, `LeadsPage.columns.score`, `NewLeadPage.fields.region`, `OnboardingPage.customFields.defaults.regionLabel`, `ProfileSettings.organization.logoFallback`
- Other obvious leftovers:
  `EditLeadPage.common.optional`, `EditLeadPage.contact.valueLabel.wechat`, `PipelinePage.leadFallback`

## `messages/es.json`

- Error/common labels are still English:
  `BillingCustomersPage.errors.prefix`, `BillingInvoiceDetailPage.errors.prefix`, `BillingInvoicesPage.errors.prefix`, `BillingNewInvoicePage.errors.prefix`, `BillingPaymentDetailPage.errors.prefix`, `BillingProductArchivePage.errors.prefix`, `BillingProductDetailPage.errors.prefix`, `BillingProductFormPage.errors.prefix`, `BillingProductsPage.errors.prefix`, `Common.common.no`, `CreateSchedulePage.common.error`, `CreateSchedulePage.common.min`
- Billing/payment labels are still English:
  `BillingInvoiceDetailPage.summary.total`, `BillingInvoicesPage.table.columns.total`, `BillingPaymentDetailPage.status.requiresPaymentMethod`
- Scheduling labels are still English:
  `CreateSchedulePage.hostSelection.oneOnOne.label`, `CreateSchedulePage.previewCard.bookingType.roundRobin`, `CreateSchedulePage.sections.buffers.title`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`, `SchedulePagesSettingsPage.table.color`
- Dashboard and lead labels are still English:
  `Dashboard.common.leadPlural`, `Dashboard.common.leadSingular`, `Dashboard.feed.types.lead`, `Dashboard.funnel.convShort`, `Dashboard.kpis.last30d`, `Dashboard.kpis.leads`, `LeadDetailPage.timeline.roleLead`, `LeadMessagesPage.page.leadLabel`, `LeadMessagesPage.timeline.roleLead`, `LeadScoringSettingsPage.fieldCard.pointsShort`
- Lead type / role labels are still English:
  `DomainValues.crm.leadType.individual`, `EditLeadPage.options.individual`, `LeadsPage.values.leadTypeIndividual`, `InviteTeamMembersPage.fields.roles`, `ProfileSettings.profile.roles`, `DomainValues.roles.prospector`, `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`
- Pipeline/page labels are still English:
  `AppHeader.reminders.pipelineFallback`, `AppHeader.sections.leads`, `AppHeader.sections.pipeline`, `AppSidebar.nav.leads`, `AppSidebar.nav.pipeline`, `LeadDetailPage.fallback.pipeline`, `LeadDetailPage.fields.closer`, `LeadDetailPage.fields.prospector`, `LeadDetailPage.fields.setter`, `LeadMessagesPage.fallback.pipeline`, `LeadsPage.metadata.title`, `LeadsPage.page.title`, `OnboardingPage.metadata.title`, `PipelinePage.leadFallback`, `PipelinePage.metadata.title`, `PipelinePage.page.title`, `PipelinePage.stage.leadCount`, `ProfileSettings.organization.logoFallback`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/fr.json`

- Header/navigation labels are still English:
  `AppHeader.notifications.ariaLabel`, `AppHeader.reminders.pipelineFallback`, `AppHeader.sections.pipeline`, `AppSidebar.nav.pipeline`, `PipelinePage.metadata.title`, `PipelinePage.page.title`
- Billing/admin labels are still English:
  `BillingCustomersPage.createModal.fields.email`, `BillingCustomersPage.table.columns.actions`, `BillingInvoiceDetailPage.items.table.description`, `BillingInvoiceDetailPage.modal.fields.mode`, `BillingInvoicesPage.table.columns.total`, `BillingPaymentDetailPage.fields.description`, `BillingProductDetailPage.details.descriptionLabel`, `BillingProductDetailPage.prices.table.actions`, `BillingProductDetailPage.prices.table.type`, `BillingProductFormPage.fields.description`, `BillingProductsPage.table.columns.actions`
- Call and notes labels are still English:
  `CallDetailPage.fields.notes`, `CallOutcomePage.fields.notes`, `CallsListPage.table.date`
- Scheduling labels are still English:
  `CreateSchedulePage.common.min`, `CreateSchedulePage.common.minutes`, `CreateSchedulePage.previewCard.bookingType.roundRobin`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- Dashboard labels are still English:
  `Dashboard.attention.score`, `Dashboard.feed.types.message`, `Dashboard.funnel.conversion`, `Dashboard.funnel.convShort`, `Dashboard.funnel.table.conversion`, `Dashboard.funnel.table.transition`, `LeadsPage.columns.score`, `LeadScoringSettingsPage.fieldCard.pointsShort`
- Role/field labels are still English:
  `DomainValues.crm.contactType.email`, `EditLeadPage.contact.types.email`, `LeadsPage.values.contactTypeEmail`, `InviteTeamMembersPage.fields.email`, `ProfileSettings.profile.email`, `PublicBookingPage.details.email`, `DomainValues.roles.closer`, `DomainValues.roles.manager`, `DomainValues.roles.setter`, `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.setter`
- Lead/settings labels are still English:
  `EditLeadPage.fields.niche`, `EditLeadPage.sections.contact`, `EditLeadPage.sections.notes`, `EditLeadPage.sections.source`, `LeadDetailPage.booking.columns.action`, `LeadDetailPage.booking.columns.type`, `LeadDetailPage.fallback.pipeline`, `LeadDetailPage.fields.closer`, `LeadDetailPage.fields.setter`, `LeadDetailPage.sections.notes`, `LeadMessagesPage.fallback.pipeline`, `ManageTeamRolesPage.table.columns.action`, `NicheSettingsPage.metadata.title`, `NicheSettingsPage.page.title`, `OnboardingPage.metadata.title`, `ProfileSettings.organization.logoFallback`, `SettingsPage.cards.niches.title`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/he.json`

- Billing label is still English:
  `BillingInvoiceDetailPage.modal.modes.price`
- Region options still contain English text:
  `OnboardingPage.customFields.defaults.regionOptions`

## `messages/hi.json`

- Billing/payment labels are still English:
  `BillingInvoiceDetailPage.modal.fields.priceId`, `BillingInvoiceDetailPage.modal.modes.price`, `BillingPaymentDetailPage.fields.chargeId`, `BillingPaymentDetailPage.raw.title`, `BillingProductArchivePage.confirm.stripeId`, `BillingProductDetailPage.header.stripeId`
- Billing overview helper text is still English:
  `BillingPage.cards.invoices.hint`, `BillingPage.cards.payments.hint`
- Meeting name defaults are still English:
  `CreateSchedulePage.placeholders.meetingName`, `CreateSchedulePage.previewCard.defaults.meetingName`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/id.json`

- Main navigation/page labels are still English:
  `AppHeader.reminders.pipelineFallback`, `AppHeader.sections.dashboard`, `AppHeader.sections.pipeline`, `AppSidebar.nav.dashboard`, `AppSidebar.nav.pipeline`, `AppSidebar.workspaceLabel`, `Dashboard.metadata.title`, `Dashboard.page.title`, `OnboardingPage.metadata.title`, `PipelinePage.metadata.title`, `PipelinePage.page.title`
- Billing/admin labels are still English:
  `BillingCustomersPage.createModal.fields.email`, `BillingCustomersPage.page.filterApplied`, `BillingFailedPaymentsPage.page.filterApplied`, `BillingInvoiceDetailPage.header.invoiceNumber`, `BillingInvoiceDetailPage.metadata.title`, `BillingInvoiceDetailPage.modal.fields.mode`, `BillingInvoiceDetailPage.modal.modes.price`, `BillingInvoiceDetailPage.summary.total`, `BillingInvoicesPage.page.filterApplied`, `BillingInvoicesPage.table.columns.invoice`, `BillingInvoicesPage.table.columns.status`, `BillingInvoicesPage.table.columns.total`, `BillingProductDetailPage.actions.edit`, `BillingProductDetailPage.modal.fields.interval`, `BillingProductDetailPage.prices.table.status`, `BillingProductDetailPage.statusCard.title`, `BillingProductFormPage.fields.interval`, `BillingProductsPage.actions.edit`, `BillingProductsPage.page.filterApplied`, `BillingProductsPage.table.columns.status`
- Call/conversion labels are still English:
  `CallDetailPage.actions.edit`, `CallDetailPage.fields.closedOnCall`, `CallOutcomePage.chips.closed`, `CallOutcomePage.fields.closedOnCall`, `CallsListPage.table.closed`, `CallsListPage.table.edit`, `ConversionMetricDefinitionsSettingsPage.fields.targetRate`, `ConversionMetricDefinitionsSettingsPage.placeholders.targetRate`
- Scheduling labels are still English:
  `CreateSchedulePage.hostSelection.oneOnOne.label`, `CreateSchedulePage.previewCard.bookingType.roundRobin`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- Dashboard/funnel labels are still English:
  `Dashboard.bookings.bookingFallback`, `Dashboard.common.leadSingular`, `Dashboard.feed.types.booking`, `Dashboard.feed.types.lead`, `Dashboard.funnel.dropOff`, `Dashboard.funnel.table.dropOff`, `Dashboard.funnel.table.label`, `Dashboard.funnel.targetLong`, `Dashboard.funnel.targetShort`, `Dashboard.funnel.tipLabel`
- Roles/lead labels are still English:
  `DomainValues.crm.contactType.email`, `EditLeadPage.contact.types.email`, `LeadsPage.values.contactTypeEmail`, `InviteTeamMembersPage.fields.email`, `ProfileSettings.profile.email`, `PublicBookingPage.details.email`, `DomainValues.roles.admin`, `DomainValues.roles.closer`, `DomainValues.roles.setter`, `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.setter`
- Lead detail/message and pipeline labels are still English:
  `EditLeadPage.fields.niche`, `EditLeadPage.metadata.title`, `EditLeadPage.page.title`, `LeadDetailPage.actions.edit`, `LeadDetailPage.booking.columns.host`, `LeadDetailPage.booking.host`, `LeadDetailPage.fallback.pipeline`, `LeadDetailPage.fields.closer`, `LeadDetailPage.fields.setter`, `LeadDetailPage.timeline.alt.closedOnCall`, `LeadDetailPage.timeline.events.closedOnCall`, `LeadDetailPage.timeline.events.closedOnCallShort`, `LeadDetailPage.timeline.roleLead`, `LeadMessagesPage.fallback.pipeline`, `LeadMessagesPage.form.directionInbound`, `LeadMessagesPage.form.directionOutbound`, `LeadMessagesPage.page.leadLabel`, `LeadMessagesPage.timeline.alt.closedOnCall`, `LeadMessagesPage.timeline.events.closedOnCall`, `LeadMessagesPage.timeline.events.closedOnCallShort`, `LeadMessagesPage.timeline.roleLead`, `LeadScoringSettingsPage.tip.title`, `LeadsPage.actions.edit`, `LeadsPage.actions.editLead`, `LeadFieldsSettingsPage.fieldTypes.select`, `OnboardingPage.customFields.fieldTypes.select`, `OnboardingPage.pipeline.defaults.closed`, `PipelinePage.leadFallback`, `ProfileSettings.organization.logoFallback`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/it.json`

- Auth/navigation labels are still English:
  `AcceptInvitePage.fields.password`, `AppHeader.reminders.pipelineFallback`, `AppHeader.sections.dashboard`, `AppHeader.sections.pipeline`, `AppSidebar.nav.dashboard`, `AppSidebar.nav.home`, `AppSidebar.nav.pipeline`, `AppSidebar.workspaceLabel`, `Dashboard.metadata.title`, `Dashboard.page.title`, `PipelinePage.metadata.title`, `PipelinePage.page.title`
- Scheduling labels are still English:
  `CreateSchedulePage.common.min`, `CreateSchedulePage.hostSelection.oneOnOne.label`, `CreateSchedulePage.previewCard.bookingType.roundRobin`, `CreateSchedulePage.previewCard.footer.poweredBy`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- Dashboard/lead labels are still English:
  `Dashboard.common.leadSingular`, `Dashboard.feed.types.lead`, `Dashboard.filters.team`, `Dashboard.funnel.convShort`, `Dashboard.funnel.dropShort`, `Dashboard.status.live`, `LeadDetailPage.timeline.roleLead`, `LeadDetailPage.timeline.roleTeam`, `LeadMessagesPage.page.leadLabel`, `LeadMessagesPage.timeline.roleLead`, `LeadMessagesPage.timeline.roleTeam`
- Source categories and roles are still English:
  `DomainValues.crm.contactType.email`, `EditLeadPage.contact.types.email`, `LeadsPage.values.contactTypeEmail`, `InviteTeamMembersPage.fields.email`, `ProfileSettings.profile.email`, `PublicBookingPage.details.email`, `DomainValues.crm.sourceCategory.inbound`, `DomainValues.crm.sourceCategory.outbound`, `DomainValues.crm.sourceCategory.partner`, `EditLeadPage.sourceCategory.inbound`, `EditLeadPage.sourceCategory.outbound`, `EditLeadPage.sourceCategory.partner`, `LeadsPage.values.sourceCategoryInbound`, `LeadsPage.values.sourceCategoryOutbound`, `LeadsPage.values.sourceCategoryPartner`, `DomainValues.roles.closer`, `DomainValues.roles.manager`, `DomainValues.roles.setter`, `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`
- Lead detail/message labels are still English:
  `LeadDetailPage.booking.columns.host`, `LeadDetailPage.booking.host`, `LeadDetailPage.fallback.pipeline`, `LeadDetailPage.fields.closer`, `LeadDetailPage.fields.prospector`, `LeadDetailPage.fields.setter`, `LeadFieldsSettingsPage.fieldTypes.link`, `LeadMessagesPage.fallback.pipeline`, `ProfileSettings.organization.logoFallback`, `PipelinePage.leadFallback`

## `messages/ja.json`

- Billing label is still English:
  `BillingInvoiceDetailPage.modal.modes.price`
- English ID label is still present:
  `EditLeadPage.contact.valueLabel.wechat`
- Region options still contain English text:
  `OnboardingPage.customFields.defaults.regionOptions`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/ko.json`

- Billing/payment labels are still English:
  `BillingInvoiceDetailPage.modal.fields.priceId`, `BillingInvoiceDetailPage.modal.modes.price`
- English ID label is still present:
  `EditLeadPage.contact.valueLabel.wechat`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/nl.json`

- Header/navigation labels are still English:
  `AppHeader.notifications.openCount`, `AppHeader.reminders.pipelineFallback`, `AppHeader.sections.dashboard`, `AppHeader.sections.leads`, `AppHeader.sections.pipeline`, `AppSidebar.nav.dashboard`, `AppSidebar.nav.home`, `AppSidebar.nav.leads`, `AppSidebar.nav.pipeline`
- Billing/admin labels are still English:
  `BillingCustomersPage.page.filterApplied`, `BillingFailedPaymentsPage.page.filterApplied`, `BillingInvoiceDetailPage.modal.modes.price`, `BillingInvoiceDetailPage.status.open`, `BillingInvoicesPage.page.filterApplied`, `BillingInvoicesPage.status.open`, `BillingInvoicesPage.table.columns.status`, `BillingProductDetailPage.activity.fallbacks.product`, `BillingProductDetailPage.details.title`, `BillingProductDetailPage.metadata.title`, `BillingProductDetailPage.modal.fields.interval`, `BillingProductDetailPage.modal.intervals.week`, `BillingProductDetailPage.prices.table.status`, `BillingProductDetailPage.prices.table.type`, `BillingProductDetailPage.statusCard.title`, `BillingProductFormPage.fields.interval`, `BillingProductsPage.page.filterApplied`, `BillingProductsPage.table.columns.product`, `BillingProductsPage.table.columns.status`, `CallOutcomePage.fields.product`, `DomainValues.billing.invoiceStatus.open`
- Scheduling labels are still English:
  `CreateSchedulePage.common.min`, `CreateSchedulePage.hostSelection.oneOnOne.label`, `CreateSchedulePage.placeholders.meetingName`, `CreateSchedulePage.previewCard.bookingType.roundRobin`, `CreateSchedulePage.previewCard.defaults.meetingName`, `CreateSchedulePage.sections.buffers.title`, `CreateSchedulePage.typeBadge.roundRobin`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- Dashboard labels are still English:
  `Dashboard.attention.score`, `Dashboard.common.leadPlural`, `Dashboard.common.leadSingular`, `Dashboard.feed.types.lead`, `Dashboard.filters.team`, `Dashboard.funnel.convShort`, `Dashboard.funnel.table.label`, `Dashboard.funnel.tipLabel`, `Dashboard.kpis.closeRate30d`, `Dashboard.kpis.last30d`, `Dashboard.kpis.leads`, `Dashboard.kpis.showRate30d`, `Dashboard.metadata.title`, `Dashboard.page.title`, `Dashboard.status.live`
- Source category and role labels are still English:
  `DomainValues.crm.sourceCategory.partner`, `EditLeadPage.sourceCategory.partner`, `LeadsPage.values.sourceCategoryPartner`, `DomainValues.roles.closer`, `DomainValues.roles.manager`, `DomainValues.roles.prospector`, `DomainValues.roles.setter`, `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`
- Lead/settings labels are still English:
  `EditLeadPage.fields.niche`, `EditLeadPage.sections.contact`, `LeadDetailPage.booking.columns.host`, `LeadDetailPage.booking.columns.type`, `LeadDetailPage.booking.host`, `LeadDetailPage.channels.pipeline`, `LeadDetailPage.fallback.leadInPipeline`, `LeadDetailPage.fallback.pipeline`, `LeadDetailPage.fields.closer`, `LeadDetailPage.fields.prospector`, `LeadDetailPage.fields.setter`, `LeadDetailPage.timeline.roleLead`, `LeadDetailPage.timeline.roleTeam`, `LeadFieldsSettingsPage.fieldTypes.boolean`, `LeadFieldsSettingsPage.fieldTypes.link`, `LeadFieldsSettingsPage.fieldTypes.select`, `LeadMessagesPage.channels.pipeline`, `LeadMessagesPage.fallback.pipeline`, `LeadMessagesPage.fallback.pipelineLead`, `LeadMessagesPage.page.leadLabel`, `LeadMessagesPage.timeline.roleLead`, `LeadMessagesPage.timeline.roleTeam`, `LeadScoringSettingsPage.fieldCard.typeLabel`, `LeadScoringSettingsPage.metadata.title`, `LeadScoringSettingsPage.page.title`, `LeadScoringSettingsPage.tip.title`, `LeadsPage.columns.score`, `LeadsPage.metadata.title`, `LeadsPage.page.title`, `NicheSettingsPage.metadata.title`, `NicheSettingsPage.page.title`, `OnboardingPage.customFields.fieldTypes.boolean`, `OnboardingPage.customFields.fieldTypes.select`, `OnboardingPage.metadata.title`, `PipelinePage.leadFallback`, `PipelinePage.metadata.title`, `PipelinePage.page.title`, `PipelinePage.stage.leadCount`, `SettingsPage.cards.leadScoring.title`, `SettingsPage.cards.niches.title`
- Branding/booking fallback labels are still English:
  `ProductSuiteSidebar.brand.logoAlt`, `ProfileSettings.organization.logoFallback`, `PublicBookingPage.header.hostsCount`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/pl.json`

- Main navigation/page labels are still English:
  `AppHeader.reminders.pipelineFallback`, `AppHeader.sections.dashboard`, `AppHeader.sections.pipeline`, `AppSidebar.nav.dashboard`, `AppSidebar.nav.pipeline`, `AppSidebar.workspaceLabel`, `Dashboard.metadata.title`, `Dashboard.page.title`, `OnboardingPage.metadata.title`, `PipelinePage.metadata.title`, `PipelinePage.page.title`
- Billing/admin labels are still English:
  `BillingCustomersPage.createModal.fields.email`, `BillingInvoiceDetailPage.modal.modes.price`, `BillingInvoicesPage.table.columns.status`, `BillingProductDetailPage.prices.table.status`, `BillingProductDetailPage.statusCard.title`, `BillingProductsPage.table.columns.status`
- Scheduling labels are still English:
  `CreateSchedulePage.common.min`, `CreateSchedulePage.hostSelection.oneOnOne.label`, `CreateSchedulePage.previewCard.bookingType.roundRobin`, `LeadDetailPage.booking.columns.host`, `LeadDetailPage.booking.host`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- Dashboard/lead labels are still English:
  `Dashboard.common.leadSingular`, `Dashboard.feed.types.lead`, `Dashboard.kpis.last30d`, `LeadDetailPage.channels.pipeline`, `LeadDetailPage.fallback.pipeline`, `LeadDetailPage.fields.closer`, `LeadDetailPage.fields.prospector`, `LeadDetailPage.fields.setter`, `LeadDetailPage.timeline.roleLead`, `LeadFieldsSettingsPage.fieldTypes.boolean`, `LeadFieldsSettingsPage.fieldTypes.link`, `LeadMessagesPage.channels.pipeline`, `LeadMessagesPage.fallback.pipeline`, `LeadMessagesPage.page.leadLabel`, `LeadMessagesPage.timeline.roleLead`, `PipelinePage.leadFallback`
- Source/role/region labels are still English:
  `DomainValues.crm.sourceCategory.partner`, `EditLeadPage.sourceCategory.partner`, `LeadsPage.values.sourceCategoryPartner`, `InviteTeamMembersPage.fields.email`, `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`, `LeadsPage.columns.region`, `NewLeadPage.fields.region`, `OnboardingPage.customFields.defaults.regionLabel`
- Other obvious leftovers:
  `OnboardingPage.customFields.fieldTypes.boolean`, `ProfileSettings.organization.logoFallback`, `PublicBookingPage.details.email`

## `messages/pt.json`

- Navigation/page labels are still English:
  `AppHeader.reminders.pipelineFallback`, `AppHeader.sections.leads`, `AppHeader.sections.pipeline`, `AppSidebar.nav.leads`, `AppSidebar.nav.pipeline`, `LeadsPage.metadata.title`, `LeadsPage.page.title`, `LoginPage.metadata.title`, `OnboardingPage.metadata.title`, `PipelinePage.leadFallback`, `PipelinePage.metadata.title`, `PipelinePage.page.title`, `PipelinePage.stage.leadCount`
- Billing/payment labels are still English:
  `BillingCustomersPage.createModal.fields.email`, `BillingInvoiceDetailPage.summary.total`, `BillingInvoicesPage.table.columns.status`, `BillingInvoicesPage.table.columns.total`, `BillingProductDetailPage.prices.table.status`, `BillingProductDetailPage.statusCard.title`, `BillingProductsPage.table.columns.status`
- Scheduling labels are still English:
  `CreateSchedulePage.common.min`, `CreateSchedulePage.previewCard.bookingType.roundRobin`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- Dashboard/lead labels are still English:
  `Dashboard.common.leadPlural`, `Dashboard.common.leadSingular`, `Dashboard.feed.types.lead`, `Dashboard.funnel.convShort`, `Dashboard.kpis.last30d`, `Dashboard.kpis.leads`, `LeadDetailPage.channels.pipeline`, `LeadDetailPage.fallback.pipeline`, `LeadDetailPage.fields.closer`, `LeadDetailPage.fields.prospector`, `LeadDetailPage.fields.setter`, `LeadDetailPage.timeline.roleLead`, `LeadFieldsSettingsPage.fieldTypes.link`, `LeadMessagesPage.channels.pipeline`, `LeadMessagesPage.fallback.pipeline`, `LeadMessagesPage.page.leadLabel`, `LeadMessagesPage.timeline.roleLead`, `LeadScoringSettingsPage.fieldCard.pointsShort`
- Lead type, email, and role labels are still English:
  `DomainValues.crm.contactType.email`, `DomainValues.crm.leadType.individual`, `DomainValues.roles.prospector`, `EditLeadPage.contact.types.email`, `EditLeadPage.options.individual`, `InviteTeamMembersPage.fields.email`, `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`, `LeadsPage.values.contactTypeEmail`, `LeadsPage.values.leadTypeIndividual`, `ProfileSettings.profile.email`, `PublicBookingPage.details.email`
- Branding/placeholder labels are still English:
  `ProfileSettings.organization.logoFallback`, `PublicBookingPage.details.firstNamePlaceholder`

## `messages/ru.json`

- Billing/payment labels are still English:
  `BillingCustomersPage.createModal.fields.email`, `BillingInvoiceDetailPage.modal.modes.price`
- Meeting name defaults and scheduling labels are still English:
  `CreateSchedulePage.placeholders.meetingName`, `CreateSchedulePage.previewCard.bookingType.roundRobin`, `CreateSchedulePage.previewCard.defaults.meetingName`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- Email and role labels are still English:
  `EditLeadPage.contact.types.email`, `InviteTeamMembersPage.fields.email`, `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`, `LeadsPage.values.contactTypeEmail`, `PublicBookingPage.details.email`
- Region options still contain English text:
  `OnboardingPage.customFields.defaults.regionOptions`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/sw.json`

- Billing/payment labels are still English:
  `BillingInvoiceDetailPage.modal.fields.priceId`, `BillingInvoiceDetailPage.modal.modes.price`
- Scheduling labels are still English:
  `CreateSchedulePage.previewCard.bookingType.roundRobin`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- Role/lead labels are still English:
  `EditLeadPage.fields.niche`, `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `LeadDetailPage.fields.closer`, `LeadDetailPage.fields.setter`, `LeadScoringSettingsPage.fieldCard.pointsShort`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`
- English ID label is still present:
  `EditLeadPage.contact.valueLabel.wechat`
- Region options still contain English text:
  `OnboardingPage.customFields.defaults.regionOptions`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/th.json`

- Billing/payment labels are still English:
  `BillingInvoiceDetailPage.modal.fields.priceId`, `BillingInvoiceDetailPage.modal.modes.price`
- Meeting name defaults are still English:
  `CreateSchedulePage.placeholders.meetingName`, `CreateSchedulePage.previewCard.defaults.meetingName`
- Scheduling labels are still English:
  `CreateSchedulePage.previewCard.bookingType.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- English ID label is still present:
  `EditLeadPage.contact.valueLabel.wechat`
- Role names are still English in multiple places:
  `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`
- Region options still contain English text:
  `OnboardingPage.customFields.defaults.regionOptions`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/tr.json`

- Role names are still English in multiple places:
  `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`
- Brand fallback label is still English:
  `ProfileSettings.organization.logoFallback`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/uk.json`

- Billing/admin count labels are still English:
  `BillingFailedPaymentsPage.table.totalCount`, `BillingInvoiceDetailPage.modal.fields.priceId`, `BillingInvoiceDetailPage.modal.modes.price`, `BillingPaymentsPage.table.totalCount`, `BillingProductDetailPage.activity.text.pricesCount`, `BillingProductDetailPage.activity.text.productsCount`
- Meeting name defaults and scheduling labels are still English:
  `CreateSchedulePage.placeholders.meetingName`, `CreateSchedulePage.previewCard.bookingType.roundRobin`, `CreateSchedulePage.previewCard.defaults.meetingName`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- Role names are still English in multiple places:
  `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `LeadDetailPage.fields.closer`, `LeadDetailPage.fields.prospector`, `LeadDetailPage.fields.setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`
- Onboarding summary/count labels are still English:
  `OnboardingPage.finish.summary.fields`, `OnboardingPage.finish.summary.invites`, `OnboardingPage.finish.summary.metrics`, `OnboardingPage.finish.summary.stages`, `PipelinePage.stage.leadCount`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/ur.json`

- Metadata/page titles are still English across billing, scheduling, CRM, and settings pages:
  `BillingCustomersPage.metadata.title`, `BillingFailedPaymentsPage.metadata.title`, `BillingInvoiceDetailPage.metadata.title`, `BillingInvoicesPage.metadata.title`, `BillingNewInvoicePage.metadata.title`, `BillingPage.metadata.title`, `BillingPaymentDetailPage.metadata.title`, `BillingPaymentsPage.metadata.title`, `BillingProductArchivePage.metadata.title`, `BillingProductDetailPage.metadata.title`, `BillingProductFormPage.metadata.create.title`, `BillingProductFormPage.metadata.edit.title`, `BillingProductsPage.metadata.title`, `BookingLinksPage.metadata.title`, `CalendarPage.metadata.title`, `CallDetailPage.metadata.title`, `CallOutcomePage.metadata.title`, `CallsListPage.metadata.title`, `ConversionMetricDefinitionsSettingsPage.metadata.title`, `CreateSchedulePage.metadata.title`, `Dashboard.metadata.title`, `DeleteLeadPage.metadata.title`, `DeleteSchedulePage.metadata.title`, `EditLeadPage.metadata.title`, `InviteTeamMembersPage.metadata.title`, `LeadDetailPage.metadata.title`, `LeadFieldsSettingsPage.metadata.title`, `LeadMessagesPage.metadata.title`, `LeadScoringSettingsPage.metadata.title`, `LeadsPage.metadata.title`, `LoginPage.metadata.title`, `ManageTeamRolesPage.metadata.title`, `NewLeadPage.metadata.title`, `NicheSettingsPage.metadata.title`, `OnboardingPage.metadata.title`, `PipelinePage.metadata.title`, `PipelineStagesSettingsPage.metadata.title`, `RegisterPage.metadata.title`, `SettingsPage.metadata.title`
- Billing/payment labels are still English:
  `BillingInvoiceDetailPage.modal.fields.priceId`, `BillingInvoiceDetailPage.modal.modes.price`, `BillingPaymentDetailPage.raw.title`
- Meeting name default is still English:
  `CreateSchedulePage.previewCard.defaults.meetingName`
- English ID label is still present:
  `EditLeadPage.contact.valueLabel.wechat`
- Role names are still English in multiple places:
  `InviteTeamMembersPage.roles.Admin`, `InviteTeamMembersPage.roles.Closer`, `InviteTeamMembersPage.roles.Manager`, `InviteTeamMembersPage.roles.Prospector`, `InviteTeamMembersPage.roles.Setter`, `ManageTeamRolesPage.roles.Admin`, `ManageTeamRolesPage.roles.Closer`, `ManageTeamRolesPage.roles.Manager`, `ManageTeamRolesPage.roles.Prospector`, `ManageTeamRolesPage.roles.Setter`, `OnboardingPage.invites.roles.admin`, `OnboardingPage.invites.roles.closer`, `OnboardingPage.invites.roles.manager`, `OnboardingPage.invites.roles.prospector`, `OnboardingPage.invites.roles.setter`
- Onboarding defaults still contain English text:
  `OnboardingPage.customFields.defaults.industryLabel`, `OnboardingPage.customFields.defaults.regionLabel`, `OnboardingPage.customFields.defaults.regionOptions`, `OnboardingPage.teamSetup.defaults.teamName`
- Scheduling label is still English:
  `SchedulePagesSettingsPage.types.oneOnOne.label`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/vi.json`

- Billing/payment labels are still English:
  `BillingCustomersPage.createModal.fields.email`, `BillingInvoiceDetailPage.modal.modes.price`
- Email labels are still English in multiple places:
  `DomainValues.crm.contactType.email`, `EditLeadPage.contact.types.email`, `InviteTeamMembersPage.fields.email`, `LeadsPage.values.contactTypeEmail`, `ProfileSettings.profile.email`, `PublicBookingPage.details.email`
- Scheduling labels are still English:
  `CreateSchedulePage.previewCard.bookingType.roundRobin`, `LeadDetailPage.booking.hostRoundRobin`, `LeadDetailPage.booking.types.roundRobin`, `PublicBookingPage.types.round_robin`, `SchedulePagesSettingsPage.badges.roundRobin`, `SchedulePagesSettingsPage.types.roundRobin.label`
- Brand fallback label is still English:
  `ProfileSettings.organization.logoFallback`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`

## `messages/zh.json`

- Billing/payment labels are still English:
  `BillingInvoiceDetailPage.modal.fields.priceId`, `BillingInvoiceDetailPage.modal.modes.price`
- Brand fallback label is still English:
  `ProfileSettings.organization.logoFallback`
- Placeholder first name is still English:
  `PublicBookingPage.details.firstNamePlaceholder`
