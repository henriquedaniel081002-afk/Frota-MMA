export type Database = {
  public: {
    Tables: {
      expenses: {
        Row: {
          id: string;
          fleet_code: string;
          date: string; // Supabase retorna date como string (YYYY-MM-DD)
          truck_plate: string;
          category: "fuel" | "maintenance";
          amount: number;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          fleet_code: string;
          date: string;
          truck_plate: string;
          category: "fuel" | "maintenance";
          amount: number;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          fleet_code?: string;
          date?: string;
          truck_plate?: string;
          category?: "fuel" | "maintenance";
          amount?: number;
          note?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};
