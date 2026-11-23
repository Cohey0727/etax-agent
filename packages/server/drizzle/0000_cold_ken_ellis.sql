CREATE TABLE "imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text,
	"source_name" text,
	"mapping" jsonb,
	"row_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" varchar(10) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount" integer NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '未分類' NOT NULL,
	"income_type" text DEFAULT 'other' NOT NULL,
	"import_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;