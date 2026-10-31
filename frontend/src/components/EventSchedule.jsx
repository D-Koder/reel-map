import { Mail, Phone, TriangleAlert } from 'lucide-react';
import { activeRun, contactLinks, datesText, eventStatus, runsOf, timeKnown, timesText } from '../lib/eventRuns';

const BADGES = { open: 'On now', soon: 'Today', later: 'Next' };

// An event's place page: when it's on as one card (the run to look at is marked), its price, and who to ask.
export default function EventSchedule({ place }) {
  const runs = runsOf(place);
  const status = runs.length ? eventStatus(runs) : null;
  const active = runs.length ? activeRun(runs) : null;
  const links = contactLinks(place.event_contact);
  const price = String(place.event_price || '').trim();

  return (
    <>
      {/* An event with no dates still shows this section, so the missing date is never silent. */}
      {(
        <div className="modal-section">
          <div className="evt-section-head">
            <div className="modal-label">When it's on</div>
            {price && <span className={`evt-chip${/^free\b/i.test(price) ? ' is-free' : ''}`}>{price}</span>}
          </div>
          {status && status.kind === 'over' && (
            <div className="evt-warn-note" role="alert"><TriangleAlert className="ico" aria-hidden="true" /> This event has finished. Check before you go.</div>
          )}
          {runs.length > 0 && (
            <ul className="evt-card">
              {runs.map((run) => {
                const mark = active && run.start === active.start && status ? status.kind : null;
                return (
                  <li key={run.start} className={mark ? `is-active is-${mark}` : ''}>
                    <span className="evt-card-dates">
                      {datesText(run)}
                      {mark && <span className={`evt-badge is-${mark}`}>{BADGES[mark]}</span>}
                    </span>
                    <span className="evt-card-times">{timesText(run)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {!runs.length && (
            <div className="evt-warn-note"><TriangleAlert className="ico" aria-hidden="true" /> No date set for this event. Check the post, then add the dates.</div>
          )}
          {runs.some((run) => !timeKnown(run)) && (
            <div className="evt-warn-note"><TriangleAlert className="ico" aria-hidden="true" /> The post gives no time. Check before you go.</div>
          )}
          {/* The next-day case is shown by the "Next" mark, and a finished event by the warning above. */}
          {status && status.kind !== 'later' && status.kind !== 'over' && (
            <div className={`evt-status is-${status.kind}`}>{status.text}</div>
          )}
        </div>
      )}
      {links.length > 0 && (
        <div className="modal-section">
          <div className="modal-label">Enquiries</div>
          <div className="evt-links">
            {links.map((link) => (
              <a key={link.href} className="evt-link-chip" href={link.href}>
                {link.kind === 'email' ? <Mail size={16} aria-hidden="true" /> : <Phone size={16} aria-hidden="true" />}
                <span>{link.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
