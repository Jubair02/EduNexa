import type { UserRole } from "@/types";

/**
 * Help content, kept as data so it can be searched and filtered rather than
 * buried in markup.
 *
 * Every answer here describes behaviour the app actually has. Nothing promises
 * a channel that does not exist — there is no support inbox and no
 * password-reset email, and the answers say so plainly instead of inventing one.
 */
export interface HelpTopic {
  /** Stable id, used as the anchor and the React key. */
  id: string;
  question: string;
  /** Paragraphs. Plain text — rendered as text, never as markup. */
  answer: string[];
  /** Who the answer is for. `null` means everyone. */
  audience: UserRole | null;
  /** Extra words to match on that the question does not contain. */
  keywords?: string[];
}

export const HELP_TOPICS: HelpTopic[] = [
  // ---- Accounts and signing in (everyone) ----
  {
    id: "get-an-account",
    question: "How do I get an account?",
    audience: null,
    keywords: ["register", "sign up", "join"],
    answer: [
      "Anyone can create their own account from the Create account page. Self-registration always creates a student account.",
      "Instructor and administrator accounts are created for you by an administrator — you cannot choose a role when you register.",
    ],
  },
  {
    id: "forgot-password",
    question: "I have forgotten my password. How do I get back in?",
    audience: null,
    keywords: ["reset", "locked out", "cannot sign in", "email"],
    answer: [
      "EduNexa does not send password-reset emails yet, so there is no self-service link.",
      "Ask an administrator to set a new password for you. They can do this from Users, by opening your account and choosing Reset password. They will need to pass the new password to you directly.",
      "Once you are back in, change it to something only you know from Settings.",
    ],
  },
  {
    id: "change-password",
    question: "How do I change my password?",
    audience: null,
    keywords: ["security", "settings"],
    answer: [
      "Go to Settings and use the Change password form. You need your current password, which is what stops someone who finds an unlocked device from taking over the account.",
      "Passwords must be at least 8 characters. You stay signed in on this device after changing it.",
    ],
  },
  {
    id: "change-name-email",
    question: "How do I change my name or email address?",
    audience: null,
    keywords: ["profile", "rename"],
    answer: [
      "Open Profile and edit your name or email, then save. Your email is also your sign-in address, so changing it changes how you log in.",
      "Your role and whether your account is active are not yours to change — ask an administrator if either looks wrong.",
    ],
  },
  {
    id: "account-deactivated",
    question: "Why does it say my account has been deactivated?",
    audience: null,
    keywords: ["disabled", "blocked", "cannot log in"],
    answer: [
      "An administrator has switched your account off. Deactivated accounts cannot sign in, and any session already open stops working.",
      "Your courses, progress and certificates are untouched — they come back exactly as they were if the account is reactivated. Contact an administrator to ask why.",
    ],
  },

  // ---- Students ----
  {
    id: "join-a-course",
    question: "How do I join a course?",
    audience: "student",
    keywords: ["enroll", "enrol", "sign up for a course"],
    answer: [
      "Open Browse Courses, pick a course, and choose Enroll. Only published courses appear in the catalogue, so if you cannot find one it may not be published yet.",
      "You can enrol in as many courses as you like, and enrolling twice in the same course is not possible — you are simply already in it.",
    ],
  },
  {
    id: "cannot-see-lessons",
    question: "Why can't I open the lessons in a course?",
    audience: "student",
    keywords: ["locked", "access denied", "403", "preview"],
    answer: [
      "Lesson content needs an active enrolment. If you have not enrolled yet, the course page will offer you the button to do so.",
      "Some courses mark one or two lessons as previews — those are readable by anyone, including people who are not signed in.",
      "If a lesson you expected is missing entirely, the instructor has probably not published it yet. Unpublished lessons, modules and courses are hidden from students rather than shown as locked.",
    ],
  },
  {
    id: "progress-calculation",
    question: "How is my course progress worked out?",
    audience: "student",
    keywords: ["percentage", "percent", "complete", "how much left"],
    answer: [
      "Progress counts two things: the published lessons in the course, and the quizzes the instructor marked as required.",
      "Your percentage is the lessons you have completed plus the required quizzes you have passed, divided by the total of both.",
      "Optional quizzes do not count towards it, and anything inside an unpublished module is left out of both halves of the sum — so a course never asks you to finish something you cannot see.",
    ],
  },
  {
    id: "retake-quiz",
    question: "Can I retake a quiz?",
    audience: "student",
    keywords: ["attempt", "failed", "again", "best score"],
    answer: [
      "Yes, as many times as you like. Every attempt is kept, and your best one is what counts.",
      "Passing a required quiz once satisfies it permanently — a later attempt that scores lower never takes that away.",
      "Your attempts and best score for each quiz are on the Quizzes page.",
    ],
  },
  {
    id: "quiz-marking",
    question: "How are quizzes marked?",
    audience: "student",
    keywords: ["score", "grade", "passing score", "unanswered"],
    answer: [
      "Marking happens on the server against the answer key, which is never sent to your browser. Each question is worth the points the instructor set, and your percentage is your points over the total.",
      "A question you leave unanswered counts as incorrect.",
      "You pass if your percentage reaches the passing score shown on the quiz.",
    ],
  },
  {
    id: "get-certificate",
    question: "When do I get my certificate?",
    audience: "student",
    keywords: ["completion", "finish", "pdf", "download"],
    answer: [
      "The moment your progress reaches 100% — every published lesson complete and every required quiz passed — the certificate is issued automatically. There is nothing to request.",
      "You will find it on the Certificates page, where you can download it as a PDF.",
      "A course with no published lessons or quizzes cannot be completed, because there is nothing in it to finish.",
    ],
  },
  {
    id: "share-certificate",
    question: "How do I prove my certificate is genuine?",
    audience: "student",
    keywords: ["verify", "verification code", "employer", "share"],
    answer: [
      "Every certificate carries a certificate number and a verification code. Anyone can check it, without signing in, using the verification link on the certificate.",
      "The public check shows only what is printed on the certificate: your name, the course, the instructor and the dates. It never exposes your email or anything else about your account.",
    ],
  },
  {
    id: "cancel-enrollment",
    question: "What happens if I leave a course?",
    audience: "student",
    keywords: ["cancel", "unenroll", "drop out", "rejoin"],
    answer: [
      "Cancelling an enrolment hides the course from your list and stops your access to the lessons. Nothing is deleted.",
      "Your completed lessons and quiz attempts are all still there, so if you enrol again later you carry on where you stopped rather than starting over.",
    ],
  },
  {
    id: "after-completion",
    question: "Do I lose access to a course once I finish it?",
    audience: "student",
    keywords: ["completed", "revisit", "review"],
    answer: [
      "No. A completed course stays open, so you can go back over the lessons and retake quizzes whenever you want.",
      "Your completion date and certificate are fixed at the moment you finished, and revisiting the course does not change them.",
    ],
  },

  // ---- Instructors ----
  {
    id: "publish-a-course",
    question: "How do I publish a course so students can see it?",
    audience: "instructor",
    keywords: ["draft", "live", "visible", "publish"],
    answer: [
      "Publishing has three levels, and all three have to be done: each lesson, then the module holding it, then the course itself.",
      "A course starts as a draft. Build your modules and lessons first, publish the lessons you are happy with, publish their modules, then set the course to published.",
      "This is why a published course can still look empty to students — the lessons or their module are probably still drafts.",
    ],
  },
  {
    id: "lesson-not-visible",
    question: "Why can't my students see a lesson I added?",
    audience: "instructor",
    keywords: ["hidden", "missing", "draft lesson"],
    answer: [
      "Check all three levels: the lesson, its module and the course must each be published.",
      "Also check that the student has an active enrolment. Without one, only lessons you marked as previews are readable.",
    ],
  },
  {
    id: "lesson-types",
    question: "What kinds of lesson can I create?",
    audience: "instructor",
    keywords: ["video", "text", "pdf", "document", "upload"],
    answer: [
      "Four: video, text, PDF and document. Each needs its matching content — a video lesson needs a video URL, a text lesson needs a body, and PDF or document lessons need a file.",
      "Text lessons hold up to 50,000 characters.",
    ],
  },
  {
    id: "file-limits",
    question: "What files can I upload, and how large?",
    audience: "instructor",
    keywords: ["size", "limit", "image", "thumbnail", "docx"],
    answer: [
      "Images for course thumbnails: JPEG, PNG or WEBP, up to 5 MB. PDFs: up to 20 MB. Word documents: DOC or DOCX, up to 20 MB.",
      "Uploads are checked by their actual contents, not their file extension, so renaming a file to get around a limit will not work.",
    ],
  },
  {
    id: "video-urls",
    question: "Which video links work?",
    audience: "instructor",
    keywords: ["youtube", "vimeo", "embed", "url"],
    answer: [
      "YouTube and Vimeo links are recognised and embedded as a player. Ordinary YouTube watch links, youtu.be short links, Shorts and Vimeo links all work.",
      "Any other http or https link to a video file is played directly. Links that are not http or https are rejected.",
    ],
  },
  {
    id: "required-quizzes",
    question: "What does marking a quiz as required do?",
    audience: "instructor",
    keywords: ["optional", "completion", "passing score"],
    answer: [
      "A required quiz becomes part of course completion: a student has to pass it, alongside finishing every published lesson, before the course counts as complete and a certificate is issued.",
      "An optional quiz is still available to students and still recorded, but it never blocks completion.",
      "Only published quizzes count. A required quiz left as a draft is ignored entirely.",
    ],
  },
  {
    id: "cannot-delete",
    question: "Why won't it let me delete this?",
    audience: "instructor",
    keywords: ["delete", "remove", "blocked", "409"],
    answer: [
      "Three deletions are deliberately blocked to protect student records. A quiz cannot be deleted once a student has attempted it. A module cannot be deleted while it still contains lessons. A course cannot be deleted while it still contains modules.",
      "Work inwards: delete or move the lessons, then the module, then the course. For a quiz that has been attempted, unpublish it instead — that takes it out of students' view and out of completion without destroying their attempts.",
    ],
  },
  {
    id: "student-progress",
    question: "Where can I see how my students are doing?",
    audience: "instructor",
    keywords: ["dashboard", "analytics", "results", "who is behind"],
    answer: [
      "Your Dashboard shows how many students you teach, their average progress, your completion rate and how your quizzes are performing, plus a per-course breakdown and a short list of students who look stuck.",
      "For one course, open it from My Courses: the course page lists everyone enrolled and their status, and each quiz has a results view with every attempt.",
    ],
  },

  // ---- Administrators ----
  {
    id: "create-staff",
    question: "How do I create an instructor or another administrator?",
    audience: "admin",
    keywords: ["new user", "role", "provision"],
    answer: [
      "Go to Users and choose New user. You can set any role there, which is the only way an instructor or administrator account gets created — self-registration always produces a student.",
      "You can also change an existing person's role by editing their account, though you cannot change your own.",
    ],
  },
  {
    id: "reset-someone-password",
    question: "How do I reset someone else's password?",
    audience: "admin",
    keywords: ["locked out", "help a user", "forgot"],
    answer: [
      "Open Users, click the person, and choose Reset password. You can type a password or generate one.",
      "There is no reset email, so you have to pass the new password to them yourself. It is shown once and cannot be retrieved afterwards. Ask them to change it from Settings once they are in.",
    ],
  },
  {
    id: "deactivate-vs-delete",
    question: "Should I deactivate an account or delete it?",
    audience: "admin",
    keywords: ["remove user", "disable", "offboard"],
    answer: [
      "Deactivating is almost always the right choice. The person cannot sign in and their existing sessions stop working immediately, but their enrolments, progress and certificates stay intact and come back if you reactivate them.",
      "Deleting removes the account permanently. You cannot delete your own account.",
    ],
  },
  {
    id: "revoke-certificate",
    question: "Can a certificate be revoked?",
    audience: "admin",
    keywords: ["invalid", "mistake", "withdraw"],
    answer: [
      "Yes, from Certificates. Revoking never deletes the record: the certificate stays visible to the student and in your list, but public verification reports it as not valid.",
      "You can restore a revoked certificate later, which makes verification succeed again.",
    ],
  },
  {
    id: "quiz-attempt-log",
    question: "Where can I see every quiz attempt on the platform?",
    audience: "admin",
    keywords: ["attempts", "audit", "scores"],
    answer: [
      "Quiz Attempts lists every submission across every course, with the student, the quiz, the score and whether it passed. You can search it and filter by result.",
    ],
  },
];

/** Section labels for the audience filter. */
export const AUDIENCE_LABELS: Record<string, string> = {
  all: "Everyone",
  student: "Students",
  instructor: "Instructors",
  admin: "Administrators",
};

/** Case-insensitive match across question, answer and keywords. */
export const matchesQuery = (topic: HelpTopic, query: string): boolean => {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  const haystack = [topic.question, ...topic.answer, ...(topic.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
};
