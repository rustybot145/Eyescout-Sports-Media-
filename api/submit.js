export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured' });

  const b = req.body;

  // Silently drop bot submissions (honeypot)
  if (b._gotcha) return res.status(200).json({ success: true });

  const itemName = (b.athlete_name || b.team_name || b.name || 'New Lead').slice(0, 255);

  const packageTypeLabel = b.package_type === 'Individual' ? 'Individual Package'
    : b.package_type === 'Team' ? 'Team Package' : null;

  const productLabel = b.package_format === 'Photo' ? 'Action Photos'
    : b.package_format === 'Video' ? 'Highlight Reel' : null;

  // Consolidate fields without dedicated Monday columns into notes
  const noteParts = [
    b.athlete_name && b.name ? `Contact: ${b.name}` : null,
    b.photo_shot_type  ? `Shot Type: ${b.photo_shot_type}` : null,
    b.num_athletes     ? `# Athletes: ${b.num_athletes}` : null,
    b.video_type       ? `Video Type: ${b.video_type}` : null,
    b.video_length     ? `Length: ${b.video_length}` : null,
    b.footage_source   ? `Footage: ${b.footage_source}` : null,
    b.team_photo_coverage ? `Coverage: ${b.team_photo_coverage}` : null,
    b.num_events       ? `# Events: ${b.num_events}` : null,
    b.turnaround_time  ? `Turnaround: ${b.turnaround_time}` : null,
    b.location         ? `Location: ${b.location}` : null,
    b.notes            ? `Notes: ${b.notes}` : null,
  ].filter(Boolean).join(' | ');

  const cv = {};
  if (b.email)        cv['email6nw22z6b']      = { email: b.email, text: b.email };
  if (b.phone)        cv['phonex1ygg6gn']       = { phone: b.phone, countryShortName: 'US' };
  if (b.sport)        cv['short_textrsxcf77u']  = b.sport;
  if (packageTypeLabel) cv['single_select4yykhxn'] = { label: packageTypeLabel };
  if (productLabel)   cv['single_select0jtegqo'] = { label: productLabel };
  if (b.jersey_number && /^\d+$/.test(b.jersey_number.trim()))
                      cv['numberaxq3zvvq']       = b.jersey_number.trim();
  if (b.event_date)   cv['dateqsncj8ic']         = { date: b.event_date };
  if (b.team_name)    cv['short_text6uofv04d']   = b.team_name;
  if (noteParts)      cv['short_textrgw10aq4']   = noteParts;

  const mutation = `
    mutation CreateItem($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
        id
      }
    }
  `;

  try {
    const mondayRes = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-01',
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          boardId: '18396329837',
          itemName,
          columnValues: JSON.stringify(cv),
        },
      }),
    });

    const data = await mondayRes.json();

    if (data.errors?.length) {
      console.error('Monday.com errors:', JSON.stringify(data.errors));
      return res.status(500).json({ error: 'CRM error' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Network error' });
  }
}
