import { sessionStore } from '../core/session';
import { useStore } from '../core/store';
import { LEARNING_NOTE } from './Menus';

/**
 * Privacy notice (Art. 13 GDPR) in plain language for learners.
 * DRAFT – to be reviewed by school management and the school's data protection officer.
 * Same content as docs/datenschutz/03_Datenschutzinformation_Lernende.md.
 */
export function PrivacyText() {
  const info = useStore(sessionStore, (s) => s.info);
  const r = info?.retention ?? {
    inactiveDays: 183,
    attemptsDays: 56,
    activityDays: 365,
    selfDeleteGraceDays: 7,
  };
  const months = Math.round(r.inactiveDays / 30.5);
  return (
    <div class="prose privacy-text">
      <p class="hint-box">
        <strong>Entwurf</strong> – wird von Schulleitung und Datenschutzbeauftragter/m der Schule
        geprüft.
      </p>
      <h3>Wer ist verantwortlich?</h3>
      <p>
        {info?.schoolName ?? '[Schule]'} ({info?.schoolContact ?? '[Kontakt]'}).
        Datenschutzbeauftragte/r: {info?.dpoContact ?? '[Kontakt]'}.
      </p>
      <h3>Wofür ist das Spiel da?</h3>
      <p>
        Die Pixel-Lernwelt ist ein Lernspiel für den Unterricht. Deine Lehrkraft sieht, wie du
        vorankommst, damit sie dich gezielt unterstützen kann. <strong>{LEARNING_NOTE}</strong>{' '}
        Deine Daten werden für nichts anderes verwendet, zum Beispiel nicht für Werbung.
      </p>
      <h3>Welche Daten werden gespeichert?</h3>
      <ul>
        <li>dein Benutzername (ein Fantasiename, nicht dein echter Name) und deine Klasse</li>
        <li>dein Passwort – nur als sicherer „Fingerabdruck“ (Hash), niemand kann es lesen</li>
        <li>dein Spielstand: Level, Sterne, Bytes, Gegenstände, Aussehen deiner Figur, Erfolge</li>
        <li>
          deine Antworten auf Aufgaben: richtig/falsch, Anzahl der Versuche, benötigte Zeit,
          genutzte Hinweise
        </li>
        <li>wie viele Minuten pro Tag du online warst</li>
        <li>deine Einstellungen (Lautstärke, Tasten, Barrierefreiheit)</li>
      </ul>
      <p>
        <strong>Nicht gespeichert</strong> werden: dein echter Name, E-Mail-Adresse, Geburtsdatum,
        Fotos, IP-Adresse, wo du dich in der Spielwelt bewegst, Mausbewegungen oder
        Tastatureingaben. Es gibt keinen freien Chat.
      </p>
      <h3>Auf welcher Grundlage?</h3>
      <p>
        [Platzhalter zur Prüfung: Art. 6 Abs. 1 lit. e DSGVO i. V. m. Art. 85 BayEUG und § 46
        BaySchO, wenn das Spiel im Unterricht eingesetzt wird – bzw. deine Einwilligung (Art. 6 Abs.
        1 lit. a DSGVO) in der freiwilligen Testphase.]
      </p>
      <h3>Wer sieht deine Daten?</h3>
      <ul>
        <li>die Lehrkräfte deiner Klasse – nur deine Lerndaten aus diesem Spiel</li>
        <li>die technische Administration – keine Lerndaten, nur was für den Betrieb nötig ist</li>
        <li>
          Mitspielende sehen höchstens deinen Benutzernamen und deine Figur, wenn deine Lehrkraft
          das gemeinsame Spielen oder Ranglisten einschaltet. In Ranglisten kannst du anonym
          erscheinen.
        </li>
        <li>
          Betrieb des Servers: {info?.hostingInfo ?? '[Hoster]'}. Es gibt keine Weitergabe an
          andere.
        </li>
      </ul>
      <h3>Wie lange?</h3>
      <ul>
        <li>
          Einzelne Aufgabenversuche: {Math.round(r.attemptsDays / 7)} Wochen, danach nur noch
          zusammengefasst.
        </li>
        <li>Online-Minuten: höchstens {Math.round(r.activityDays / 30.5)} Monate.</li>
        <li>
          Dein Konto wird automatisch gelöscht, wenn du {months} Monate nicht aktiv warst – vorher
          erhält deine Lehrkraft eine Warnung.
        </li>
        <li>Datensicherungen (Backups) werden nach 30 Tagen überschrieben.</li>
      </ul>
      <h3>Deine Rechte</h3>
      <p>
        Du kannst jederzeit nachsehen, welche Daten gespeichert sind, und sie herunterladen („Meine
        Daten“ im Menü). Du kannst Berichtigung, Löschung oder Einschränkung verlangen und
        widersprechen – am einfachsten über deine Lehrkraft. Du kannst dein Konto auch selbst
        löschen (mit {r.selfDeleteGraceDays} Tagen Bedenkzeit). Du hast außerdem das Recht, dich
        beim Bayerischen Landesbeauftragten für den Datenschutz zu beschweren.
      </p>
      <h3>Cookies</h3>
      <p>
        Es gibt nur ein technisch notwendiges Cookie, das dich angemeldet hält. Es gibt keine Werbe-
        oder Tracking-Cookies und keine fremden Dienste.
      </p>
    </div>
  );
}
