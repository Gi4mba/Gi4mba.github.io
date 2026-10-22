// ---- Checks ----
_validateNewsChecks(_newsId, newsData);
_validateRating(_rating);

// ---- Effects ----
hasValidated[_newsId][msg.sender] = true;
newsRatingGiven[_newsId][msg.sender] = _rating;
newsData.validationCount++;

emit NewsValidated(_newsId, msg.sender);
