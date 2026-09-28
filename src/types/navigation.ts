export type CourseScope = { campus: string; term: string };

export type RootStackParamList = {
  Browse: undefined;
  Course: CourseScope & { code: string };
};
