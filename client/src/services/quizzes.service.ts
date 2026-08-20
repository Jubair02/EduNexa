import type {
  ApiResponse,
  AttemptListParams,
  AttemptResult,
  AttemptWithStudent,
  CourseProgress,
  MyQuizResults,
  Pagination,
  Quiz,
  QuizAnswerInput,
  QuizPayload,
  QuizResultsSummary,
  StudentQuizOverview,
} from "@/types";
import { api, unwrap } from "./api";

interface AttemptListResult {
  attempts: AttemptWithStudent[];
  pagination: Pagination;
}

const toQuery = (params: AttemptListParams): Record<string, string | number> => {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
  };
  if (params.search.trim()) query.search = params.search.trim();
  if (params.passed) query.passed = params.passed;
  if (params.quiz) query.quiz = params.quiz;
  if (params.course) query.course = params.course;
  return query;
};

export const quizzesService = {
  async listByCourse(courseId: string): Promise<Quiz[]> {
    const res = await api.get<ApiResponse<Quiz[]>>(`/courses/${courseId}/quizzes`);
    return res.data.data ?? [];
  },

  async get(id: string): Promise<Quiz> {
    const res = await api.get<ApiResponse<{ quiz: Quiz }>>(`/quizzes/${id}`);
    return unwrap(res.data).quiz;
  },

  /** Every quiz across the student's courses, with their own results. */
  async myQuizzes(
    params: { page: number; limit: number } = { page: 1, limit: 20 }
  ): Promise<{ quizzes: StudentQuizOverview[]; pagination: Pagination }> {
    const res = await api.get<ApiResponse<StudentQuizOverview[]>>("/quizzes/my-quizzes", {
      params,
    });
    const quizzes = res.data.data ?? [];
    return {
      quizzes,
      pagination:
        res.data.pagination ?? {
          page: params.page,
          limit: params.limit,
          total: quizzes.length,
          totalPages: 1,
        },
    };
  },

  async create(courseId: string, payload: QuizPayload): Promise<Quiz> {
    const res = await api.post<ApiResponse<{ quiz: Quiz }>>(
      `/courses/${courseId}/quizzes`,
      payload
    );
    return unwrap(res.data).quiz;
  },

  async update(id: string, payload: Partial<QuizPayload>): Promise<Quiz> {
    const res = await api.put<ApiResponse<{ quiz: Quiz }>>(`/quizzes/${id}`, payload);
    return unwrap(res.data).quiz;
  },

  async setStatus(id: string, isPublished: boolean): Promise<Quiz> {
    const res = await api.patch<ApiResponse<{ quiz: Quiz }>>(`/quizzes/${id}/status`, {
      isPublished,
    });
    return unwrap(res.data).quiz;
  },

  async remove(id: string): Promise<void> {
    await api.delete<ApiResponse>(`/quizzes/${id}`);
  },

  /** Answers only — the score comes back computed by the server. */
  async submit(
    id: string,
    answers: QuizAnswerInput[]
  ): Promise<{ result: AttemptResult; courseProgress: CourseProgress }> {
    const res = await api.post<
      ApiResponse<{ result: AttemptResult; courseProgress: CourseProgress }>
    >(`/quizzes/${id}/submit`, { answers });
    return unwrap(res.data);
  },

  async myResults(id: string): Promise<MyQuizResults> {
    const res = await api.get<ApiResponse<MyQuizResults>>(`/quizzes/${id}/my-results`);
    return unwrap(res.data);
  },

  async results(
    id: string,
    params: AttemptListParams
  ): Promise<AttemptListResult & { summary: QuizResultsSummary }> {
    const res = await api.get<ApiResponse<AttemptWithStudent[]>>(
      `/quizzes/${id}/results`,
      { params: toQuery(params) }
    );
    const body = res.data as ApiResponse<AttemptWithStudent[]> & {
      summary?: QuizResultsSummary;
    };
    return {
      attempts: body.data ?? [],
      pagination:
        body.pagination ?? {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
        },
      summary:
        body.summary ?? {
          quizId: id,
          quizTitle: "",
          passingScore: 0,
          totalAttempts: 0,
          studentsAttempted: 0,
          studentsPassed: 0,
          averagePercentage: null,
        },
    };
  },

  async allAttempts(params: AttemptListParams): Promise<AttemptListResult> {
    const res = await api.get<ApiResponse<AttemptWithStudent[]>>("/quiz-attempts", {
      params: toQuery(params),
    });
    return {
      attempts: res.data.data ?? [],
      pagination:
        res.data.pagination ?? {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
        },
    };
  },
};
