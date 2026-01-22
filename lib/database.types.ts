export type Database = {
  public: {
    Tables: {
      expenses: {
        Row: {
          id: string;
          fleet_code: string;
          date: string; // YYYY-MM-DD
          truck_plate: string;
          km: number;
          category: "fuel" | "maintenance";
          amount: number;
          liters: number | null;
          invoice_number: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          fleet_code: string;
          date: string;
          truck_plate: string;
          km: number;
          category: "fuel" | "maintenance";
          amount: number;
          liters?: number | null;
          invoice_number?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          fleet_code?: string;
          date?: string;
          truck_plate?: string;
          km?: number;
          category?: "fuel" | "maintenance";
          amount?: number;
          liters?: number | null;
          invoice_number?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
