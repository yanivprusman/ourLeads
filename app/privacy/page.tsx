import type { Metadata } from "next";

export const metadata: Metadata = { title: "מדיניות פרטיות – ג.ח. פרוייקטים" };

/**
 * The privacy policy Meta requires before the business line's app can be
 * published (lib/cloud.ts). Public — `proxy.ts` guards only `/`. It says what the
 * assistant actually does, including that an AI reads the messages.
 */
export default function PrivacyPage() {
  return (
    <main dir="rtl" className="min-h-dvh bg-paper text-ink">
      <article className="max-w-2xl mx-auto px-4 py-10 space-y-5 leading-relaxed">
        <h1 className="text-2xl font-extrabold">מדיניות פרטיות – ג.ח. פרוייקטים</h1>
        <p className="text-muted text-sm">עודכן: 10 באוקטובר 2026</p>
        <p>
          מדיניות זו חלה על פניות לג.ח. פרוייקטים (עבודות גובה, הרחקת יונים וניקוי חלונות) בוואטסאפ, במספר 055-944-8186.
        </p>
        <h2 className="text-lg font-bold">מה נשמר</h2>
        <p>
          מה שאתם שולחים לנו: הודעות, תמונות, סרטונים, הקלטות קוליות ומיקום, וכן מספר הטלפון והשם שמופיעים בוואטסאפ שלכם.
        </p>
        <h2 className="text-lg font-bold">למה</h2>
        <p>
          כדי להבין מה העבודה, לתת הצעת מחיר, לתאם ולבצע אותה. איננו מוכרים את המידע ואיננו משתמשים בו לפרסום.
        </p>
        <h2 className="text-lg font-bold">עוזר אוטומטי</h2>
        <p>
          כשאנחנו באמצע עבודה, עוזר מבוסס בינה מלאכותית (Claude של Anthropic) קורא את ההודעות, עונה בשמנו ומציין שהוא עוזר.
          הוא לא נותן מחירים — מחיר מגיע רק מאיתנו. ההודעות עוברות דרך WhatsApp Business של Meta.
        </p>
        <h2 className="text-lg font-bold">שמירה ומחיקה</h2>
        <p>
          המידע נשמר בשרתים שלנו כל עוד הוא נחוץ לעבודה ולחשבונאות. כדי לקבל או למחוק את המידע שלכם, כתבו לנו בוואטסאפ למספר
          055-944-8186.
        </p>
      </article>
    </main>
  );
}
