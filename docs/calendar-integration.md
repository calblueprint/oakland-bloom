# OAK-10 calendar recommendation

## Recommendation: FullCalendar React with custom amenity controls

I recommend using FullCalendar's weekly time grid, with Timeful as the reference
for the drag-to-select interaction. Timeful demonstrates the experience I want,
but its application uses Vue 2 and focuses on participants' availability. Adapting
its code to our React/Next.js project would require porting components and replacing
availability-poll logic with amenity reservation logic.
[Timeful repository](https://github.com/schej-it/timeful.app),
[frontend dependencies](https://github.com/schej-it/timeful.app/blob/main/frontend/package.json).

FullCalendar supports React, weekly calendar views, and selecting time ranges by
clicking and dragging. I would build amenity checkboxes around the calendar and
display reservation records with amenity labels and approval statuses. My assessment
is that this requires less integration work than adapting Timeful while preserving
the core interaction we want.
[React integration](https://fullcalendar.io/docs/react),
[weekly grid](https://fullcalendar.io/docs/timegrid-view),
[drag selection](https://fullcalendar.io/docs/selectable).

The standard features are MIT licensed. Separate amenity columns would require
evaluating Premium resource views and their licensing. My proposed next step,
after this research sprint, is a small prototype to verify Figma styling, amenity
filtering, and drag behavior. Booking validation and conflict prevention will remain
application responsibilities. [Licensing](https://fullcalendar.io/license).

## Comparison

| Criterion           | Adapt Timeful                                                                                          | FullCalendar React                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Weekly time grid    | Existing availability grid is a useful interaction reference; reservation display requires adaptation. | Weekly TimeGrid view is available.                                                                                              |
| Reservation display | Replace availability-poll concepts with amenity, owner, and approval-status records.                   | Map reservation IDs, start/end times, and custom labels into calendar events.                                                   |
| Amenity controls    | Add reservation-specific filtering to the ported UI.                                                   | Build React checkboxes outside the calendar and filter the displayed events. Separate resource columns need Premium evaluation. |
| Figma styling       | Port and restyle the Vue UI in React.                                                                  | Customize React event content and calendar styling; exact Figma fit still needs a prototype.                                    |
| Licensing           | The repository uses AGPL-3.0; copying/adapting its source needs a licensing review.                    | Standard features use MIT; Premium features have separate terms.                                                                |
| Integration effort  | Higher in my assessment: framework port plus replacing the core data model.                            | Lower in my assessment: React integration exists, with application-specific filtering and validation still to build.            |

[Timeful license](https://github.com/schej-it/timeful.app/blob/main/LICENSE),
[FullCalendar custom React content](https://fullcalendar.io/docs/react#content-injection),
[FullCalendar licensing](https://fullcalendar.io/license).

## Scope and limits

This is a recommendation, not a tested calendar integration. I have not installed a
calendar library, built calendar UI, or verified a pixel-level match against Figma.
Selection would propose a booking time; the application must still validate it and
prevent conflicts. The current reservation query reads one chef's records, which
is not necessarily sufficient for a shared availability calendar. The visibility
rules and any additional availability query need a separate design with the team.
