export const metadata = { robots: { index: false, follow: false } };

export default function Danke() {
  return (
    <main style={{ maxWidth: 640 }}>
      <h1>Thank you</h1>
      <p>Your subscription is set up. You will receive a welcome email with a short form to choose your areas and signals.</p>
      <p className="muted">Merci ! Vous recevrez un e-mail de bienvenue avec un formulaire pour choisir vos zones et signaux.</p>
    </main>
  );
}
