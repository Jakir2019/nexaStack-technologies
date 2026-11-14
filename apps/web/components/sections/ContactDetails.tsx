import { SocialLinks } from '@/components/ui/SocialLinks';
import { WhatsAppLink } from '@/components/layout/WhatsAppLink';
import { company } from '@/config/company';

const LIST_LINK_CLASSES =
  'rounded-field text-primary-blue underline-offset-4 focus-ring hover:text-primary-blue-hover hover:underline';

/**
 * Contact details, business hours and social links sidebar. Server Component — every value
 * comes from `config/company.ts`, never retyped (root CLAUDE.md 4).
 */
export function ContactDetails() {
  return (
    <div className="min-w-0 space-y-10">
      <div>
        <h2 className="text-card font-semibold tracking-tight text-primary">Contact Details</h2>
        <address className="mt-4 space-y-3 text-body text-secondary not-italic">
          <p>{company.address.full}</p>
          <p>
            <a href={company.phone.href} className={LIST_LINK_CLASSES}>
              {company.phone.display}
            </a>
          </p>
          <dl className="space-y-3">
            <div>
              <dt className="text-label font-semibold text-primary">Business Email</dt>
              <dd>
                <a
                  href={company.email.href}
                  aria-label={`Business Email: ${company.email.general}`}
                  className="block min-h-11 content-center rounded-field font-semibold wrap-anywhere text-primary-blue underline-offset-4 focus-ring hover:text-primary-blue-hover hover:underline"
                >
                  {company.email.general}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-label font-medium text-secondary">Alternative Email</dt>
              <dd>
                <a
                  href={company.email.secondaryHref}
                  aria-label={`Alternative Email: ${company.email.secondary}`}
                  className="block min-h-11 content-center rounded-field wrap-anywhere text-secondary underline-offset-4 focus-ring hover:text-primary-blue-hover hover:underline"
                >
                  {company.email.secondary}
                </a>
              </dd>
            </div>
          </dl>
        </address>
        <div className="mt-4">
          <WhatsAppLink />
        </div>
      </div>

      <div>
        <h2 className="text-card font-semibold tracking-tight text-primary">Business Hours</h2>
        <dl className="mt-4 space-y-2 text-body text-secondary">
          <div className="flex justify-between gap-4">
            <dt>Open</dt>
            <dd>{company.hours.display}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Weekly holiday</dt>
            <dd>{company.hours.weeklyHoliday}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Time zone</dt>
            <dd>
              {company.hours.timeZone} (UTC{company.hours.utcOffset})
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <h2 className="text-card font-semibold tracking-tight text-primary">Follow</h2>
        <div className="mt-4">
          <SocialLinks />
        </div>
      </div>
    </div>
  );
}
