resource "aws_dynamodb_table" "members" {
  name         = local.table_names.members
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "tokens" {
  name         = local.table_names.tokens
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"
  range_key    = "token"

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "token"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  ttl {
    attribute_name = "expiresAtEpoch"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "surveys" {
  name         = local.table_names.surveys
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "responses" {
  name         = local.table_names.responses
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "surveyId"
  range_key    = "responseId"

  attribute {
    name = "surveyId"
    type = "S"
  }

  attribute {
    name = "responseId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "events" {
  name         = local.table_names.events
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "news" {
  name         = local.table_names.news
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "slug"

  attribute {
    name = "slug"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "marketplace" {
  name         = local.table_names.marketplace
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

locals {
  marketplace_seed_items = {
    "sinis-kitchen" = {
      name            = "Sinis kitchen"
      category        = "Food & Catering"
      description     = "Authentic Kerala snacks, party orders and traditional sadhya prepared for family celebrations, gatherings and special occasions."
      fullDescription = "Sinis kitchen brings the authentic taste of Kerala to local celebrations with freshly prepared snacks and party food. Popular options include parippu vada and unniappam, along with traditional sadhya orders for birthdays, housewarmings, family events, office gatherings and other special occasions. Advance booking is appreciated so each order can be prepared with care."
      services        = ["Kerala snacks", "Parippu vada", "Unniappam", "Traditional sadhya", "Party orders", "Event catering"]
      contactPerson   = "Sini Anson"
      phone           = "0431888466"
      whatsapp        = "0431888466"
      featured        = true
    }
    "aussie-werribee-naga-oggu" = {
      name            = "Aussie Werribee - Naga Tapasvee Oggu"
      category        = "Finance & Mortgage"
      description     = "Aussie Retail Broker helping first home buyers, refinancers and property investors with practical home loan guidance."
      fullDescription = "Naga Tapasvee Oggu is an Aussie Retail Broker based in Werribee, with a strong banking background and more than five years of experience as a credit assessor. That lender-side experience helps clients understand what banks look for when assessing a home loan application.\n\nNaga supports first home buyers, refinancers and property investors with clear options, practical advice and end-to-end paperwork support. The focus is to make the home loan process simple, transparent and less stressful, so clients can move toward their property goals with confidence."
      services        = ["First home buyer loans", "Refinancing support", "Investment property loans", "Borrowing capacity guidance", "Loan application paperwork", "Lender assessment guidance"]
      contactPerson   = "Naga Tapasvee Oggu"
      phone           = "0478240725"
      email           = "naga.oggu@aussie.com.au"
      whatsapp        = "0478240725"
      logoUrl         = "/static/logos/aussie-werribee-logo.svg"
      featured        = false
    }
    "curry-leaf-by-lakshmi" = {
      name            = "Curry Leaf By Lakshmi"
      category        = "Food & Catering"
      description     = "Homestyle Indian and Kerala-inspired food prepared for family meals, gatherings and small celebrations."
      fullDescription = "Curry Leaf By Lakshmi offers homestyle food for families, get-togethers and community occasions. The menu is available as a PDF on this page, making it easy to browse dishes and plan an order before getting in touch."
      services        = ["Homestyle meals", "Kerala-inspired dishes", "Party food orders", "Family gathering catering"]
      contactPerson   = "Lakshmi"
      whatsapp        = "+91 6235179095,+91 9497323231"
      logoUrl         = "/static/logos/curry-leaf-by-lakshmi-logo.svg"
      menuPdfUrl      = "/static/marketplace/curry-leaf-by-lakshmi-menu.pdf"
      featured        = false
    }
    "reliance-real-estate-harsha" = {
      name            = "Reliance Real Estate"
      category        = "Real Estate"
      description     = "Helping buyers, sellers, landlords and investors achieve their property goals with trusted advice, local expertise and personalised service across Melbourne's western suburbs."
      fullDescription = "Whether you're buying your first home, selling your property, leasing an investment or looking for reliable property management, the Reliance team provides expert guidance and end-to-end support to help you achieve the best possible outcome. Their focus is on building lasting relationships through honest advice, local market knowledge and exceptional customer service."
      services        = ["Residential property sales", "Property management", "Residential leasing", "Property appraisals", "First home buyer guidance", "Investment property advice", "Property marketing", "Auction sales", "End-to-end buying and selling support"]
      contactPerson   = "Harsha"
      phone           = "+61444512647"
      email           = "Harsha@reliancere.com.au"
      whatsapp        = "+61444512647"
      logoUrl         = "/static/logos/reliance_logo.jpg"
      featured        = true
    }
  }
}

resource "aws_dynamodb_table_item" "marketplace_seed" {
  for_each = local.marketplace_seed_items

  table_name = aws_dynamodb_table.marketplace.name
  hash_key   = aws_dynamodb_table.marketplace.hash_key

  item = jsonencode({
    id              = { S = each.key }
    slug            = { S = each.key }
    name            = { S = each.value.name }
    category        = { S = each.value.category }
    description     = { S = each.value.description }
    fullDescription = { S = each.value.fullDescription }
    services        = { L = [for service in each.value.services : { S = service }] }
    contactPerson   = { S = each.value.contactPerson }
    phone           = { S = try(each.value.phone, "") }
    email           = { S = try(each.value.email, "") }
    website         = { S = try(each.value.website, "") }
    whatsapp        = { S = try(each.value.whatsapp, "") }
    logoUrl         = { S = try(each.value.logoUrl, "") }
    bannerUrl       = { S = "" }
    menuPdfUrl      = { S = try(each.value.menuPdfUrl, "") }
    gallery         = { L = [] }
    featured        = { BOOL = each.value.featured }
    active          = { BOOL = true }
    createdBy       = { S = "terraform-seed" }
    createdAt       = { S = "2026-06-15T00:00:00.000Z" }
    updatedAt       = { S = "2026-06-15T00:00:00.000Z" }
  })

  lifecycle {
    ignore_changes = [item]
  }
}

resource "aws_dynamodb_table" "gallery" {
  name         = local.table_names.gallery
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

locals {
  gallery_seed_photos = {
    "gallery-seed-01" = { fileName = "gallery1.jpg", sortOrder = 1 }
    "gallery-seed-02" = { fileName = "gallery2.jpg", sortOrder = 2 }
    "gallery-seed-03" = { fileName = "gallery3.jpg", sortOrder = 3 }
    "gallery-seed-04" = { fileName = "gallery4.jpg", sortOrder = 4 }
    "gallery-seed-05" = { fileName = "gallery6.jpg", sortOrder = 5 }
    "gallery-seed-06" = { fileName = "gallery7.jpg", sortOrder = 6 }
    "gallery-seed-07" = { fileName = "Team7.jpeg", sortOrder = 7 }
    "gallery-seed-08" = { fileName = "Team10.jpeg", sortOrder = 8 }
    "gallery-seed-09" = { fileName = "tpl1.jpeg", sortOrder = 9 }
    "gallery-seed-10" = { fileName = "tpl2.jpeg", sortOrder = 10 }
    "gallery-seed-11" = { fileName = "tpl3.jpeg", sortOrder = 11 }
    "gallery-seed-12" = { fileName = "tpl4.jpeg", sortOrder = 12 }
    "gallery-seed-13" = { fileName = "tpl5.jpeg", sortOrder = 13 }
    "gallery-seed-14" = { fileName = "tpl6.jpeg", sortOrder = 14 }
    "gallery-seed-15" = { fileName = "tpl7.jpeg", sortOrder = 15 }
    "gallery-seed-16" = { fileName = "tpl8.jpeg", sortOrder = 16 }
    "gallery-seed-17" = { fileName = "tpl9.jpeg", sortOrder = 17 }
    "gallery-seed-18" = { fileName = "tpl10.jpeg", sortOrder = 18 }
  }
}

resource "aws_dynamodb_table_item" "gallery_seed" {
  for_each = local.gallery_seed_photos

  table_name = aws_dynamodb_table.gallery.name
  hash_key   = aws_dynamodb_table.gallery.hash_key

  item = jsonencode({
    id               = { S = each.key }
    assetKey         = { S = "static/photos/gallery/${each.value.fileName}" }
    caption          = { S = "" }
    published        = { BOOL = true }
    sortOrder        = { N = tostring(each.value.sortOrder) }
    contentType      = { S = endswith(lower(each.value.fileName), ".png") ? "image/png" : "image/jpeg" }
    originalFileName = { S = each.value.fileName }
    convertedFromHeic = { BOOL = false }
    uploadedBy       = { S = "terraform-seed" }
    createdAt        = { S = "2026-06-15T00:00:00.000Z" }
    updatedAt        = { S = "2026-06-15T00:00:00.000Z" }
  })

  lifecycle {
    ignore_changes = [item]
  }
}

resource "aws_dynamodb_table" "settings" {
  name         = local.table_names.settings
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "painting_competition" {
  name         = local.table_names.painting_competition
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "painting_submissions" {
  name         = local.table_names.painting_submissions
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "onam_schedule" {
  name         = local.table_names.onam_schedule
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table_item" "onam_schedule_config" {
  table_name = aws_dynamodb_table.onam_schedule.name
  hash_key   = aws_dynamodb_table.onam_schedule.hash_key

  item = jsonencode({
    id          = { S = "config" }
    title       = { S = "Onam 2026" }
    eyebrow     = { S = "Wyndham Tuskers presents" }
    description = { S = "A day of flowers, feasts, and togetherness — join the Wyndham Tuskers community as we celebrate Kerala's harvest festival with games, dance, and a grand Sadya." }
    eventDate   = { S = "2026-08-08" }
    venue       = { S = "Bacchus Marsh Public Hall" }
    eventStatus = { S = "upcoming" }
    published   = { BOOL = false }
    menuLabel   = { S = "Onam 2026" }
    createdAt   = { S = "2026-07-22T00:00:00.000Z" }
    updatedAt   = { S = "2026-07-22T00:00:00.000Z" }
    updatedBy   = { S = "terraform-seed" }
  })

  lifecycle {
    ignore_changes = [item]
  }
}

resource "aws_dynamodb_table_item" "painting_competition_config" {
  table_name = aws_dynamodb_table.painting_competition.name
  hash_key   = aws_dynamodb_table.painting_competition.hash_key

  item = jsonencode({
    id        = { S = "config" }
    title     = { S = "Onam 2026 Kids Painting Competition" }
    subtitle  = { S = "A colourful celebration for young artists in the Wyndham Tuskers family." }
    status    = { S = "open" }
    eventDate = { S = "2026-08-08" }
    venue     = { S = "Bacchus Marsh Hall" }
    instructions = {
      L = [
        { S = "Under 5 participants must colour the official printed template." },
        { S = "Participants aged 5-7, 8-10, and 11-14 may submit an original drawing, painting, or pencil sketch." },
        { S = "For participants aged 5 and above, the artwork theme must be Onam." },
        { S = "The artwork must be completed by the child." },
        { S = "Photograph or scan the finished page in good light with the full page in frame." },
        { S = "Keep the original artwork safe in case the judging team asks to see it." }
      ]
    }
    consentText = { S = "I confirm that I am the child's parent or guardian and consent to this artwork being reviewed by the Wyndham Tuskers judging team." }
    createdAt   = { S = "2026-06-29T00:00:00.000Z" }
    updatedAt   = { S = "2026-06-29T00:00:00.000Z" }
    updatedBy   = { S = "terraform-seed" }
  })

  lifecycle {
    ignore_changes = [item]
  }
}

resource "aws_dynamodb_table_item" "member_registration_setting" {
  table_name = aws_dynamodb_table.settings.name
  hash_key   = aws_dynamodb_table.settings.hash_key

  item = jsonencode({
    id        = { S = "memberRegistration" }
    enabled   = { BOOL = var.enable_member_registration }
    updatedAt = { S = "2026-06-14T00:00:00.000Z" }
    updatedBy = { S = "terraform-seed" }
  })

  lifecycle {
    ignore_changes = [item]
  }
}

resource "aws_dynamodb_table_item" "news_tvc_2026" {
  table_name = aws_dynamodb_table.news.name
  hash_key   = aws_dynamodb_table.news.hash_key

  item = jsonencode({
    slug          = { S = "tuskers-volleyball-championship-2026" }
    title         = { S = "Tuskers Volleyball Championship 2026" }
    excerpt       = { S = "A high-energy championship week that brought Wyndham Tuskers families together through rallies, teamwork and community spirit." }
    body          = { S = "The **Tuskers Volleyball Championship 2026** turned last week into a proper community celebration, with players, families and supporters filling the venue with energy from the first serve to the final point.\n\nAcross the matches, the standard kept rising. Teams backed each other, fought for every rally and still kept the friendly Tuskers spirit alive. The sidelines were just as lively, with families cheering, catching up and making the day feel bigger than just a tournament.\n\nA huge thank you to every player, organiser, volunteer and supporter who helped make TVC 2026 such a memorable event. Moments like these are exactly what Wyndham Tuskers is about: sport, friendship, family and a community that shows up for one another." }
    author        = { S = "Wyndham Tuskers Committee" }
    category      = { S = "Sports" }
    coverImageUrl = { S = "/static/photos/tvc-26/tvc-26-01.jpeg" }
    supportingPhotos = {
      L = [
        { M = { url = { S = "/static/photos/tvc-26/tvc-26-02.jpeg" }, caption = { S = "TVC 2026 moment" } } },
        { M = { url = { S = "/static/photos/tvc-26/tvc-26-03.jpeg" }, caption = { S = "TVC 2026 moment" } } },
        { M = { url = { S = "/static/photos/tvc-26/tvc-26-04.jpeg" }, caption = { S = "TVC 2026 moment" } } },
        { M = { url = { S = "/static/photos/tvc-26/tvc-26-05.jpeg" }, caption = { S = "TVC 2026 moment" } } },
        { M = { url = { S = "/static/photos/tvc-26/tvc-26-06.jpeg" }, caption = { S = "TVC 2026 moment" } } },
        { M = { url = { S = "/static/photos/tvc-26/tvc-26-07.jpeg" }, caption = { S = "TVC 2026 moment" } } },
        { M = { url = { S = "/static/photos/tvc-26/tvc-26-08.jpeg" }, caption = { S = "TVC 2026 moment" } } },
        { M = { url = { S = "/static/photos/tvc-26/tvc-26-09.jpeg" }, caption = { S = "TVC 2026 moment" } } }
      ]
    }
    status      = { S = "published" }
    viewCount   = { N = "0" }
    publishedAt = { S = "2026-06-08T08:00:00.000Z" }
    createdBy   = { S = "terraform-seed" }
    createdAt   = { S = "2026-06-08T08:00:00.000Z" }
    updatedAt   = { S = "2026-06-08T08:00:00.000Z" }
  })

  lifecycle {
    ignore_changes = [item]
  }
}
